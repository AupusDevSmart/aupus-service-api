import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core';
import { TarefasSchedulerService } from './tarefas-scheduler.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { buscarUltimasExecucoes } from './ciclos-das-tarefas';

/**
 * Cobre o agendamento reescrito no PR3. Cada caso aqui corresponde a um defeito
 * real que existia antes: template gerando OS, OS cancelada regenerando na
 * madrugada seguinte, tarefa anual sumindo por um ano e execucao sendo lida de
 * um campo cache em vez do historico.
 */
describe('TarefasSchedulerService', () => {
  let service: TarefasSchedulerService;

  const DIA = 24 * 60 * 60 * 1000;

  const mockPrismaService = {
    tarefas: { findMany: jest.fn(), update: jest.fn() },
    // findMany: ciclos abertos; groupBy: a última execução (agregada no banco)
    tarefas_os: { findMany: jest.fn(), groupBy: jest.fn() },
    tarefas_programacao_os: { findMany: jest.fn(), updateMany: jest.fn() },
    programacoes_os: { update: jest.fn() },
    // A regra de dias úteis (regrasDeDiasUteis): vínculos da planta, configurações e feriados
    configuracoes_dias_uteis: { findMany: jest.fn() },
    configuracao_plantas: { findMany: jest.fn() },
    feriado_plantas: { findMany: jest.fn() },
    feriados: { findMany: jest.fn() },
    // A planta de cada equipamento (plantaDeCadaEquipamento)
    $queryRaw: jest.fn(),
  };

  const mockProgramacaoService = { criarDeTarefas: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TarefasSchedulerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ProgramacaoOSService, useValue: mockProgramacaoService },
      ],
    }).compile();

    service = module.get<TarefasSchedulerService>(TarefasSchedulerService);

    mockPrismaService.tarefas_os.findMany.mockResolvedValue([]);
    mockPrismaService.tarefas_os.groupBy.mockResolvedValue([]);
    mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([]);
    mockProgramacaoService.criarDeTarefas.mockResolvedValue({ id: 'prog_1', codigo: 'PRG-001' });
    mockPrismaService.configuracoes_dias_uteis.findMany.mockResolvedValue([]);
    mockPrismaService.configuracao_plantas.findMany.mockResolvedValue([]);
    mockPrismaService.feriado_plantas.findMany.mockResolvedValue([]);
    mockPrismaService.feriados.findMany.mockResolvedValue([]);
    mockPrismaService.$queryRaw.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  describe('elegibilidade', () => {
    it('exclui tarefa de template, que nao tem equipamento', async () => {
      mockPrismaService.tarefas.findMany.mockResolvedValue([]);

      await service.gerarProgramacoesAutomaticas();

      const where = mockPrismaService.tarefas.findMany.mock.calls[0][0].where;
      expect(where.equipamento_id).toEqual({ not: null });
      // Template nao tem plano_origem_id; a copia tem
      expect(where.OR[0].plano_manutencao.plano_origem_id).toEqual({ not: null });
    });

    it('exclui tarefa removida localmente do equipamento', async () => {
      mockPrismaService.tarefas.findMany.mockResolvedValue([]);

      await service.gerarProgramacoesAutomaticas();

      const where = mockPrismaService.tarefas.findMany.mock.calls[0][0].where;
      expect(where.origem_status).toEqual({ not: 'REMOVIDA' });
    });
  });

  describe('proxima execucao', () => {
    const tarefaBase = {
      id: 'tarefa_1',
      nome: 'Lubrificar',
      tag: 'TRF-001',
      tipo_manutencao: 'PREVENTIVA',
      frequencia: 'MENSAL',
      frequencia_personalizada: null,
      data_ultima_execucao: null,
      data_ancora: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      tempo_estimado: 60,
      duracao_estimada: 1,
      equipamento_id: 'eq_1',
      equipamento: { id: 'eq_1', nome: 'Motor', criticidade: 'A', unidade_id: 'un_1', unidade: { id: 'un_1', nome: 'Unidade 1' } },
    };

    const calcular = (tarefa: Record<string, unknown>, ultima?: Date) =>
      service['calcularProximaExecucao'](tarefa as never, ultima);

    it('conta a partir da ultima execucao efetiva, nao da criacao', () => {
      const ultima = new Date('2026-06-01T00:00:00Z');

      const proxima = calcular(tarefaBase, ultima);

      expect(proxima.getTime()).toBe(ultima.getTime() + 30 * DIA);
    });

    it('usa a ancora quando ainda nao houve execucao', () => {
      const ancora = new Date('2026-07-01T00:00:00Z');

      const proxima = calcular({ ...tarefaBase, data_ancora: ancora });

      expect(proxima.getTime()).toBe(ancora.getTime() + 30 * DIA);
    });

    it('pula o ciclo quando a ancora e mais recente que a execucao (OS cancelada)', () => {
      const ultima = new Date('2026-05-01T00:00:00Z');
      const ancoraDoCicloCancelado = new Date('2026-06-01T00:00:00Z');

      const proxima = calcular({ ...tarefaBase, data_ancora: ancoraDoCicloCancelado }, ultima);

      expect(proxima.getTime()).toBe(ancoraDoCicloCancelado.getTime() + 30 * DIA);
    });

    it('respeita frequencia personalizada em dias', () => {
      const ultima = new Date('2026-06-01T00:00:00Z');

      const proxima = calcular(
        { ...tarefaBase, frequencia: 'PERSONALIZADA', frequencia_personalizada: 45 },
        ultima,
      );

      expect(proxima.getTime()).toBe(ultima.getTime() + 45 * DIA);
    });

    it('devolve null quando PERSONALIZADA nao informa os dias', () => {
      const proxima = calcular({
        ...tarefaBase,
        frequencia: 'PERSONALIZADA',
        frequencia_personalizada: null,
      });

      expect(proxima).toBeNull();
    });
  });

  describe('prioridade da programacao gerada', () => {
    const comCriticidade = (equipamento: string, tarefa: number | null = null) => ({
      criticidade: tarefa,
      equipamento: { criticidade: equipamento },
    });
    const prioridade = (cluster: unknown[]) => service['determinarPrioridade'](cluster as never);

    it('usa a criticidade 1 a 5 do cadastro de hoje (antes so A/B/C contava e tudo saia MEDIA)', () => {
      expect(prioridade([comCriticidade('5')])).toBe('ALTA');
      expect(prioridade([comCriticidade('2'), comCriticidade('1')])).toBe('BAIXA');
    });

    it('a criticidade da propria tarefa tambem conta', () => {
      expect(prioridade([comCriticidade('2', 4)])).toBe('ALTA');
    });
  });

  describe('dia util da planta', () => {
    // Outubro de 2026: 18 e domingo, 19 segunda (feriado no teste), 20 terca.
    const tarefaDoDomingo = {
      id: 'tarefa_1',
      tag: 'TRF-001',
      criticidade: 3,
      equipamento_id: 'eq_1',
      proxima_execucao: new Date('2026-10-18T13:00:00Z'),
      equipamento: { id: 'eq_1', nome: 'Motor', criticidade: '3', unidade_id: 'un_1', unidade: { id: 'un_1', nome: 'Unidade 1', planta_id: 'pl_1' } },
      planta_id: 'pl_1',
    };
    const gerar = () => service['criarProgramacaoParaCluster']([tarefaDoDomingo] as never, 'Unidade 1', 'un_1');

    it('a programacao gerada cai no proximo dia util da planta (antes saia no domingo e no feriado)', async () => {
      // O feriado é só da planta da tarefa
      mockPrismaService.feriado_plantas.findMany.mockResolvedValue([{ feriado_id: 'fer_1', planta_id: 'pl_1' }]);
      mockPrismaService.feriados.findMany.mockResolvedValue([{ id: 'fer_1', geral: false, data: new Date('2026-10-19T00:00:00Z'), recorrente: false, nome: 'Feriado' }]);

      await gerar();

      expect(mockProgramacaoService.criarDeTarefas).toHaveBeenCalledWith(
        expect.objectContaining({ data_hora_programada: '2026-10-20T13:00:00.000Z' }),
        undefined,
      );
      const where = mockPrismaService.feriado_plantas.findMany.mock.calls[0][0].where;
      expect(where.planta_id.in).toContain('pl_1');
    });

    it('o ciclo de referencia continua sendo a data prevista, e a ajustada fica registrada na origem', async () => {
      await gerar();

      expect(mockPrismaService.tarefas_programacao_os.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ciclo_referencia: tarefaDoDomingo.proxima_execucao } }),
      );
      const dados = mockPrismaService.programacoes_os.update.mock.calls[0][0].data.dados_origem;
      expect(dados).toMatchObject({ data_prevista: '2026-10-18T13:00:00.000Z', ajustada_para_dia_util: true });
    });
  });

  /**
   * Toda programação tem planta (SN-35): o grupo que não sai tem de aparecer.
   * Antes a recusa ia só para o log e se repetia toda madrugada, calada.
   */
  describe('grupos que nao saem', () => {
    const tarefa = (id: string, equipamento: string) => ({
      id, nome: id, tag: `TRF-${id}`, criticidade: 3, frequencia: 'MENSAL', frequencia_personalizada: null,
      data_ultima_execucao: null, data_ancora: null, created_at: new Date('2026-01-01T00:00:00Z'), instrucao: null,
      equipamento_id: equipamento,
      equipamento: { id: equipamento, nome: equipamento, criticidade: '3', unidade_id: 'un_1', unidade: { id: 'un_1', nome: 'Unidade 1', planta_id: 'pl_1' }, equipamento_pai: null },
    });

    it('tarefa de equipamento sem planta fica de fora, nomeada; a da planta sai', async () => {
      mockPrismaService.tarefas.findMany.mockResolvedValue([tarefa('a', 'eq_com'), tarefa('b', 'eq_sem')]);
      mockPrismaService.$queryRaw.mockResolvedValue([{ equipamento_id: 'eq_com', planta_id: 'pl_1' }]);

      const resultado = await service.gerarProgramacoesAutomaticas();

      expect(resultado.falhas).toEqual([expect.objectContaining({ tarefas: ['TRF-b'] })]);
      expect(mockProgramacaoService.criarDeTarefas).toHaveBeenCalledTimes(1);
      expect(mockProgramacaoService.criarDeTarefas.mock.calls[0][0].tarefas_ids).toEqual(['a']);
      expect(resultado.programacoesCriadas).toBe(1);
    });

    it('grupo recusado pela regra da planta entra nas falhas com as tags e o motivo', async () => {
      mockPrismaService.tarefas.findMany.mockResolvedValue([tarefa('a', 'eq_com')]);
      mockPrismaService.$queryRaw.mockResolvedValue([{ equipamento_id: 'eq_com', planta_id: 'pl_1' }]);
      mockProgramacaoService.criarDeTarefas.mockRejectedValueOnce(new Error('As tarefas escolhidas são de 2 plantas'));

      const resultado = await service.gerarProgramacoesAutomaticas();

      expect(resultado.programacoesCriadas).toBe(0);
      expect(resultado.falhas).toEqual([{ unidade: 'Unidade 1', tarefas: ['TRF-a'], motivo: 'As tarefas escolhidas são de 2 plantas' }]);
    });

    it('equipamentos da mesma unidade com plantas diferentes vão para programações separadas', async () => {
      mockPrismaService.tarefas.findMany.mockResolvedValue([tarefa('a', 'eq_1'), tarefa('b', 'eq_2')]);
      mockPrismaService.$queryRaw.mockResolvedValue([
        { equipamento_id: 'eq_1', planta_id: 'pl_1' },
        { equipamento_id: 'eq_2', planta_id: 'pl_2' },
      ]);

      await service.gerarProgramacoesAutomaticas();

      const grupos = mockProgramacaoService.criarDeTarefas.mock.calls.map((c) => c[0].tarefas_ids);
      expect(grupos).toEqual(expect.arrayContaining([['a'], ['b']]));
    });
  });

  describe('ultima execucao efetiva', () => {
    it('so considera tarefa CONCLUIDA em OS FINALIZADA', async () => {
      await buscarUltimasExecucoes(mockPrismaService as unknown as PrismaService, ['tarefa_1']);

      const where = mockPrismaService.tarefas_os.groupBy.mock.calls[0][0].where;
      expect(where.status).toBe('CONCLUIDA');
      expect(where.ordem_servico.status).toBe('FINALIZADA');
    });

    it('fica com a conclusao mais recente quando ha varias', async () => {
      const antiga = new Date('2026-01-10T00:00:00Z');
      const recente = new Date('2026-06-10T00:00:00Z');

      // As duas formas do id (com e sem o espaço do Char(26)) chegam em grupos separados
      mockPrismaService.tarefas_os.groupBy.mockResolvedValue([
        { tarefa_id: 'tarefa_1', _max: { data_conclusao: antiga } },
        { tarefa_id: 'tarefa_1 ', _max: { data_conclusao: recente } },
      ]);

      const mapa = await buscarUltimasExecucoes(mockPrismaService as unknown as PrismaService, ['tarefa_1']);

      expect(mapa.get('tarefa_1')).toEqual(recente);
    });
  });

  describe('idempotencia por ciclo', () => {
    const tarefa = (proxima: Date) => ({
      id: 'tarefa_1',
      proxima_execucao: proxima,
    });

    it('bloqueia quando ja existe item aberto para o mesmo ciclo', async () => {
      const ciclo = new Date('2026-09-01T00:00:00Z');
      mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([
        { tarefa_id: 'tarefa_1', ciclo_referencia: ciclo },
      ]);

      const result = await service['filtrarCiclosJaGerados']([tarefa(ciclo)] as never);

      expect(result).toHaveLength(0);
    });

    it('libera quando o item aberto e de outro ciclo', async () => {
      const cicloAntigo = new Date('2026-08-01T00:00:00Z');
      const cicloAtual = new Date('2026-09-01T00:00:00Z');
      mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([
        { tarefa_id: 'tarefa_1', ciclo_referencia: cicloAntigo },
      ]);

      const result = await service['filtrarCiclosJaGerados']([tarefa(cicloAtual)] as never);

      expect(result).toHaveLength(1);
    });

    it('bloqueia a tarefa inteira quando o vinculo antigo nao tem ciclo gravado', async () => {
      const ciclo = new Date('2026-09-01T00:00:00Z');
      mockPrismaService.tarefas_os.findMany.mockResolvedValue([
        { tarefa_id: 'tarefa_1', ciclo_referencia: null },
      ]);

      const result = await service['filtrarCiclosJaGerados']([tarefa(ciclo)] as never);

      expect(result).toHaveLength(0);
    });

    // TIMESTAMP(0) arredonda: o ciclo calculado depois de uma conclusão com
    // milissegundos não casava com o gravado, e a mesma programação nascia toda noite
    it('ciclo com milissegundos casa com o gravado no segundo', async () => {
      const gravado = new Date('2026-09-01T10:00:01Z');
      mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([{ tarefa_id: 'tarefa_1', ciclo_referencia: gravado }]);

      const result = await service['filtrarCiclosJaGerados']([tarefa(new Date('2026-09-01T10:00:00.640Z'))] as never);

      expect(result).toHaveLength(0);
    });

    it('OS finalizada ou cancelada nao bloqueia: quem move o ciclo e a execucao ou a ancora', async () => {
      const ciclo = new Date('2026-09-01T00:00:00Z');
      mockPrismaService.tarefas_os.findMany.mockResolvedValue([]);

      const result = await service['filtrarCiclosJaGerados']([tarefa(ciclo)] as never);

      const statusConsultados =
        mockPrismaService.tarefas_os.findMany.mock.calls[0][0].where.ordem_servico.status.in;
      expect(statusConsultados).not.toContain('FINALIZADA');
      expect(statusConsultados).not.toContain('CANCELADA');
      expect(result).toHaveLength(1);
    });
  });
});

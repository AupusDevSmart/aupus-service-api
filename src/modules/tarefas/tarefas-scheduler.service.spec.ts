import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@aupus/api-shared';
import { TarefasSchedulerService } from './tarefas-scheduler.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';

/**
 * Cobre o agendamento reescrito no PR3. Cada caso aqui corresponde a um defeito
 * real que existia antes: template gerando OS, OS cancelada regenerando na
 * madrugada seguinte, tarefa anual sumindo por um ano e execucao sendo lida de
 * um campo cache em vez do historico.
 */
describe('TarefasSchedulerService', () => {
  let service: TarefasSchedulerService;

  const DIA = 24 * 60 * 60 * 1000;

  const mockPrismaService: any = {
    tarefas: { findMany: jest.fn(), update: jest.fn() },
    tarefas_os: { findMany: jest.fn() },
    tarefas_programacao_os: { findMany: jest.fn(), updateMany: jest.fn() },
    programacoes_os: { update: jest.fn() },
  };

  const mockProgramacaoService: any = { criarDeTarefas: jest.fn() };

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
    mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([]);
    mockProgramacaoService.criarDeTarefas.mockResolvedValue({ id: 'prog_1', codigo: 'PRG-001' });
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

    const calcular = (tarefa: any, ultima?: Date) =>
      (service as any).calcularProximaExecucao(tarefa, ultima);

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

  describe('ultima execucao efetiva', () => {
    it('so considera tarefa CONCLUIDA em OS FINALIZADA', async () => {
      mockPrismaService.tarefas_os.findMany.mockResolvedValue([]);

      await (service as any).buscarUltimasExecucoes(['tarefa_1']);

      const where = mockPrismaService.tarefas_os.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('CONCLUIDA');
      expect(where.ordem_servico.status).toBe('FINALIZADA');
    });

    it('fica com a conclusao mais recente quando ha varias', async () => {
      const antiga = new Date('2026-01-10T00:00:00Z');
      const recente = new Date('2026-06-10T00:00:00Z');

      mockPrismaService.tarefas_os.findMany.mockResolvedValue([
        { tarefa_id: 'tarefa_1', data_conclusao: antiga },
        { tarefa_id: 'tarefa_1', data_conclusao: recente },
      ]);

      const mapa = await (service as any).buscarUltimasExecucoes(['tarefa_1']);

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

      const result = await (service as any).filtrarCiclosJaGerados([tarefa(ciclo)]);

      expect(result).toHaveLength(0);
    });

    it('libera quando o item aberto e de outro ciclo', async () => {
      const cicloAntigo = new Date('2026-08-01T00:00:00Z');
      const cicloAtual = new Date('2026-09-01T00:00:00Z');
      mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([
        { tarefa_id: 'tarefa_1', ciclo_referencia: cicloAntigo },
      ]);

      const result = await (service as any).filtrarCiclosJaGerados([tarefa(cicloAtual)]);

      expect(result).toHaveLength(1);
    });

    it('bloqueia a tarefa inteira quando o vinculo antigo nao tem ciclo gravado', async () => {
      const ciclo = new Date('2026-09-01T00:00:00Z');
      mockPrismaService.tarefas_os.findMany.mockResolvedValue([
        { tarefa_id: 'tarefa_1', ciclo_referencia: null },
      ]);

      const result = await (service as any).filtrarCiclosJaGerados([tarefa(ciclo)]);

      expect(result).toHaveLength(0);
    });

    it('OS finalizada ou cancelada nao bloqueia: quem move o ciclo e a execucao ou a ancora', async () => {
      const ciclo = new Date('2026-09-01T00:00:00Z');
      mockPrismaService.tarefas_os.findMany.mockResolvedValue([]);

      const result = await (service as any).filtrarCiclosJaGerados([tarefa(ciclo)]);

      const statusConsultados =
        mockPrismaService.tarefas_os.findMany.mock.calls[0][0].where.ordem_servico.status.in;
      expect(statusConsultados).not.toContain('FINALIZADA');
      expect(statusConsultados).not.toContain('CANCELADA');
      expect(result).toHaveLength(1);
    });
  });
});

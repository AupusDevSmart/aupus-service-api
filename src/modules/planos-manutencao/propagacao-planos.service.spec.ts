import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core';
import { PropagacaoPlanosService } from './propagacao-planos.service';

/**
 * A propagacao e a parte com mais casos de borda da migracao. Cada teste aqui
 * corresponde a uma forma de perder trabalho do usuario em silencio: sobrescrever
 * um ajuste local, ressuscitar uma tarefa que ele removeu, apagar uma tarefa que
 * ele criou, ou reprogramar a base inteira mexendo no estado de execucao.
 */
describe('PropagacaoPlanosService', () => {
  let service: PropagacaoPlanosService;

  const mockPrismaService: any = {
    planos_manutencao: { findFirst: jest.fn(), update: jest.fn() },
    tarefas: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    propagacoes_plano: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };

  const tarefaTemplate = (over: any = {}) => ({
    id: 'tt_1',
    nome: 'Lubrificar',
    instrucao_id: 'inst_1',
    frequencia: 'MENSAL',
    frequencia_personalizada: null,
    criticidade: 3,
    ordem: 1,
    descricao: 'desc',
    categoria: 'MECANICA',
    tipo_manutencao: 'PREVENTIVA',
    condicao_ativo: 'PARADO',
    duracao_estimada: 1,
    tempo_estimado: 60,
    ...over,
  });

  const tarefaCopia = (over: any = {}) => ({
    id: 'tc_1',
    tarefa_origem_id: 'tt_1',
    origem_status: 'HERDADA',
    nome: 'Lubrificar',
    instrucao_id: 'inst_1',
    frequencia: 'MENSAL',
    frequencia_personalizada: null,
    criticidade: 3,
    planta_id: 'planta_1',
    ...over,
  });

  const montarTemplate = (tarefas: any[], tarefasDaCopia: any[]) => ({
    id: 'template_1',
    nome: 'Preventiva de motor',
    descricao: 'desc',
    versao: '1.0',
    plano_origem_id: null,
    tarefas,
    copias: [
      { id: 'copia_1', equipamento_id: 'eq_1', tarefas: tarefasDaCopia },
    ],
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropagacaoPlanosService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PropagacaoPlanosService>(PropagacaoPlanosService);
    mockPrismaService.tarefas.count.mockResolvedValue(0);
    mockPrismaService.tarefas.findFirst.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  it('atualiza a tarefa HERDADA quando o template muda', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate([tarefaTemplate({ nome: 'Lubrificar rolamentos', criticidade: 5 })], [tarefaCopia()]),
    );

    const resultado = await service.propagar('template_1');

    expect(resultado.tarefas_atualizadas).toBe(1);
    expect(mockPrismaService.tarefas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tc_1' },
        data: expect.objectContaining({ nome: 'Lubrificar rolamentos', criticidade: 5 }),
      }),
    );
  });

  it('nao toca em tarefa CUSTOMIZADA', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate(
        [tarefaTemplate({ nome: 'Nome do template' })],
        [tarefaCopia({ origem_status: 'CUSTOMIZADA', nome: 'Ajustado na mao' })],
      ),
    );

    const resultado = await service.propagar('template_1');

    expect(resultado.tarefas_atualizadas).toBe(0);
    expect(resultado.tarefas_preservadas).toBe(1);
    expect(mockPrismaService.tarefas.update).not.toHaveBeenCalled();
  });

  it('nao toca em tarefa PROPRIA do equipamento', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate([], [tarefaCopia({ origem_status: 'PROPRIA', tarefa_origem_id: null })]),
    );

    const resultado = await service.propagar('template_1');

    expect(mockPrismaService.tarefas.update).not.toHaveBeenCalled();
    expect(resultado.tarefas_removidas).toBe(0);
  });

  it('cria nas copias a tarefa nova do template', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate([tarefaTemplate({ id: 'tt_nova' })], []),
    );

    const resultado = await service.propagar('template_1');

    expect(resultado.tarefas_criadas).toBe(1);
    const dados = mockPrismaService.tarefas.create.mock.calls[0][0].data;
    expect(dados.origem_status).toBe('HERDADA');
    expect(dados.tarefa_origem_id).toBe('tt_nova');
    expect(dados.equipamento_id).toBe('eq_1');
  });

  it('nao ressuscita tarefa que foi REMOVIDA localmente', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate([tarefaTemplate({ id: 'tt_removida' })], []),
    );
    // A tarefa existe na copia, mas com soft delete e marcada REMOVIDA
    mockPrismaService.tarefas.findFirst.mockResolvedValue({ id: 'tc_removida' });

    const resultado = await service.propagar('template_1');

    expect(resultado.tarefas_criadas).toBe(0);
    expect(resultado.tarefas_preservadas).toBe(1);
    expect(mockPrismaService.tarefas.create).not.toHaveBeenCalled();
  });

  it('remove das copias a tarefa apagada do template', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate([], [tarefaCopia({ tarefa_origem_id: 'tt_sumiu' })]),
    );

    const resultado = await service.propagar('template_1');

    expect(resultado.tarefas_removidas).toBe(1);
    expect(mockPrismaService.tarefas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tc_1' },
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );
  });

  it('preserva a customizada mesmo quando some do template', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate([], [tarefaCopia({ tarefa_origem_id: 'tt_sumiu', origem_status: 'CUSTOMIZADA' })]),
    );

    const resultado = await service.propagar('template_1');

    expect(resultado.tarefas_removidas).toBe(0);
    expect(resultado.tarefas_preservadas).toBe(1);
  });

  it('nunca escreve estado de execucao', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
      montarTemplate([tarefaTemplate({ criticidade: 5 })], [tarefaCopia()]),
    );

    await service.propagar('template_1');

    // Sobrescrever data_ultima_execucao/numero_execucoes/data_ancora
    // reprogramaria toda a base de uma vez, em silencio
    const dados = mockPrismaService.tarefas.update.mock.calls[0][0].data;
    expect(dados).not.toHaveProperty('data_ultima_execucao');
    expect(dados).not.toHaveProperty('numero_execucoes');
    expect(dados).not.toHaveProperty('data_ancora');
  });

  it('nao propaga a partir de uma copia', async () => {
    mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(null);

    await expect(service.propagar('copia_1')).rejects.toThrow('template não encontrado');

    // O findFirst filtra plano_origem_id: null justamente para isso
    const where = mockPrismaService.planos_manutencao.findFirst.mock.calls[0][0].where;
    expect(where.plano_origem_id).toBeNull();
  });

  describe('fila', () => {
    it('marca falha com o erro quando a propagacao estoura', async () => {
      mockPrismaService.propagacoes_plano.findMany.mockResolvedValue([
        { id: 'prop_1', plano_id: 'template_1' },
      ]);
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(null);

      await service.processarFila();

      expect(mockPrismaService.propagacoes_plano.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'prop_1' },
          data: expect.objectContaining({ status: 'FALHOU' }),
        }),
      );
    });

    it('grava os contadores ao concluir', async () => {
      mockPrismaService.propagacoes_plano.findMany.mockResolvedValue([
        { id: 'prop_1', plano_id: 'template_1' },
      ]);
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(
        montarTemplate([tarefaTemplate({ criticidade: 5 })], [tarefaCopia()]),
      );

      await service.processarFila();

      expect(mockPrismaService.propagacoes_plano.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CONCLUIDA',
            copias_atualizadas: 1,
            tarefas_atualizadas: 1,
          }),
        }),
      );
    });
  });
});

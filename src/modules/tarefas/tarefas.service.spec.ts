import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService, PermissionScopeService } from '@aupus/api-shared';
import { TarefasService } from './tarefas.service';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';

/**
 * Cobre a tarefa reduzida a quatro campos e as transicoes de heranca.
 *
 * As transicoes sao o que impede a propagacao de destruir trabalho: editar
 * marca CUSTOMIZADA para o template parar de sobrescrever, e remover marca
 * REMOVIDA para o template parar de ressuscitar.
 */
describe('TarefasService', () => {
  let service: TarefasService;
  let module_ref: TestingModule;

  const instrucao = {
    id: 'inst_1',
    nome: 'Ensaio TTR',
    descricao: 'Medicao de relacao de transformacao',
    categoria: 'ELETRICA',
    tipo_manutencao: 'PREVENTIVA',
    condicao_ativo: 'PARADO',
    duracao_estimada: 2,
    tempo_estimado: 120,
    criticidade: 3,
    deleted_at: null,
  };

  const mockPrismaService: any = {
    tarefas: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    instrucoes: { findFirst: jest.fn() },
    planos_manutencao: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    module_ref = await Test.createTestingModule({
      providers: [
        TarefasService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: PropagacaoPlanosService,
          useValue: { enfileirar: jest.fn().mockResolvedValue('prop_1') },
        },
        {
          provide: PermissionScopeService,
          useValue: {
            assertEntityInScope: jest.fn().mockResolvedValue(undefined),
            getScope: jest.fn().mockResolvedValue(null),
            isScoped: jest.fn().mockReturnValue(false),
          },
        },
      ],
    }).compile();

    service = module_ref.get<TarefasService>(TarefasService);
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.instrucoes.findFirst.mockResolvedValue(instrucao);
    mockPrismaService.tarefas.count.mockResolvedValue(0);
    jest.spyOn(service, 'buscarPorId').mockResolvedValue({ id: 'tarefa_1' } as any);
  });

  afterEach(() => jest.clearAllMocks());

  describe('criar', () => {
    it('herda o conteudo da instrucao e nasce PROPRIA', async () => {
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue({
        id: 'plano_1',
        equipamento_id: 'eq_1',
        equipamento: { id: 'eq_1', unidade: { planta_id: 'planta_1' } },
      });
      mockPrismaService.tarefas.findFirst.mockResolvedValue(null);
      mockPrismaService.tarefas.create.mockResolvedValue({ id: 'tarefa_1' });

      await service.criar({
        nome: 'Ensaio anual',
        instrucao_id: 'inst_1',
        frequencia: 'ANUAL' as any,
        criticidade: 4,
        plano_manutencao_id: 'plano_1',
      });

      const dados = mockPrismaService.tarefas.create.mock.calls[0][0].data;

      expect(dados.origem_status).toBe('PROPRIA');
      expect(dados.instrucao_id).toBe('inst_1');
      expect(dados.criticidade).toBe(4);
      // Conteudo vem da instrucao, nao do payload
      expect(dados.descricao).toBe(instrucao.descricao);
      expect(dados.tempo_estimado).toBe(120);
      // Copia gera OS, entao precisa de ancora
      expect(dados.data_ancora).toBeInstanceOf(Date);
    });

    it('rejeita instrucao inexistente', async () => {
      mockPrismaService.instrucoes.findFirst.mockResolvedValue(null);

      await expect(
        service.criar({
          nome: 'X',
          instrucao_id: 'nao_existe',
          frequencia: 'MENSAL' as any,
          criticidade: 3,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('tarefa de template nasce sem ancora, porque nao gera OS', async () => {
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue({
        id: 'template_1',
        equipamento_id: null,
        equipamento: null,
      });
      mockPrismaService.tarefas.findFirst.mockResolvedValue(null);
      mockPrismaService.tarefas.create.mockResolvedValue({ id: 'tarefa_1' });

      await service.criar({
        nome: 'Ensaio anual',
        instrucao_id: 'inst_1',
        frequencia: 'ANUAL' as any,
        criticidade: 4,
        plano_manutencao_id: 'template_1',
      });

      const dados = mockPrismaService.tarefas.create.mock.calls[0][0].data;
      expect(dados.data_ancora).toBeNull();
      expect(dados.equipamento_id).toBeNull();
    });
  });

  describe('propagacao a partir do template', () => {
    const enfileirar = () =>
      (module_ref.get(PropagacaoPlanosService).enfileirar as jest.Mock);

    it('enfileira ao criar tarefa num template', async () => {
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue({
        id: 'template_1',
        equipamento_id: null,
        equipamento: null,
        plano_origem_id: null,
      });
      mockPrismaService.tarefas.findFirst.mockResolvedValue(null);
      mockPrismaService.tarefas.create.mockResolvedValue({ id: 'tarefa_1' });

      await service.criar({
        nome: 'Nova',
        instrucao_id: 'inst_1',
        frequencia: 'MENSAL' as any,
        criticidade: 3,
        plano_manutencao_id: 'template_1',
      });

      // Sem isso, adicionar tarefa no template nao chegava nas copias: o
      // gatilho antigo ficava so no save do plano, que nao e tocado aqui.
      expect(enfileirar()).toHaveBeenCalledWith('template_1');
    });

    it('nao enfileira quando a tarefa e de uma copia', async () => {
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue({
        id: 'copia_1',
        equipamento_id: 'eq_1',
        equipamento: { id: 'eq_1', unidade: { planta_id: 'planta_1' } },
        plano_origem_id: 'template_1',
      });
      mockPrismaService.tarefas.findFirst.mockResolvedValue(null);
      mockPrismaService.tarefas.create.mockResolvedValue({ id: 'tarefa_1' });

      await service.criar({
        nome: 'Nova',
        instrucao_id: 'inst_1',
        frequencia: 'MENSAL' as any,
        criticidade: 3,
        plano_manutencao_id: 'copia_1',
      });

      expect(enfileirar()).not.toHaveBeenCalled();
    });
  });

  describe('transicoes de heranca', () => {
    const herdada = {
      id: 'tarefa_1',
      origem_status: 'HERDADA',
      nome: 'Original',
      instrucao_id: 'inst_1',
      frequencia: 'MENSAL',
      frequencia_personalizada: null,
      criticidade: 3,
      tag: 'TRF-001',
      plano_manutencao_id: 'copia_1',
      deleted_at: null,
    };

    it('editar campo de definicao marca CUSTOMIZADA', async () => {
      mockPrismaService.tarefas.findFirst.mockResolvedValue(herdada);
      mockPrismaService.tarefas.update.mockResolvedValue({ id: 'tarefa_1' });

      await service.atualizar('tarefa_1', { criticidade: 5 });

      const dados = mockPrismaService.tarefas.update.mock.calls[0][0].data;
      expect(dados.origem_status).toBe('CUSTOMIZADA');
    });

    it('mexer so na ordem nao customiza', async () => {
      // A primeira consulta e o verificarTarefaExiste; a segunda checa se a
      // ordem esta livre no plano
      mockPrismaService.tarefas.findFirst
        .mockResolvedValueOnce(herdada)
        .mockResolvedValueOnce(null);
      mockPrismaService.tarefas.update.mockResolvedValue({ id: 'tarefa_1' });

      await service.atualizar('tarefa_1', { ordem: 7 });

      const dados = mockPrismaService.tarefas.update.mock.calls[0][0].data;
      expect(dados.origem_status).toBeUndefined();
    });

    it('salvar sem mudar nada nao customiza', async () => {
      mockPrismaService.tarefas.findFirst.mockResolvedValue(herdada);
      mockPrismaService.tarefas.update.mockResolvedValue({ id: 'tarefa_1' });

      await service.atualizar('tarefa_1', { criticidade: 3, nome: 'Original' });

      const dados = mockPrismaService.tarefas.update.mock.calls[0][0].data;
      expect(dados.origem_status).toBeUndefined();
    });

    it('tarefa PROPRIA continua PROPRIA ao ser editada', async () => {
      mockPrismaService.tarefas.findFirst.mockResolvedValue({
        ...herdada,
        origem_status: 'PROPRIA',
      });
      mockPrismaService.tarefas.update.mockResolvedValue({ id: 'tarefa_1' });

      await service.atualizar('tarefa_1', { criticidade: 5 });

      const dados = mockPrismaService.tarefas.update.mock.calls[0][0].data;
      expect(dados.origem_status).toBeUndefined();
    });

    it('remover tarefa HERDADA marca REMOVIDA', async () => {
      mockPrismaService.tarefas.findFirst.mockResolvedValue(herdada);
      mockPrismaService.tarefas.update.mockResolvedValue({});

      await service.remover('tarefa_1');

      const dados = mockPrismaService.tarefas.update.mock.calls[0][0].data;
      expect(dados.origem_status).toBe('REMOVIDA');
      expect(dados.deleted_at).toBeInstanceOf(Date);
    });

    it('remover tarefa PROPRIA nao vira REMOVIDA', async () => {
      mockPrismaService.tarefas.findFirst.mockResolvedValue({
        ...herdada,
        origem_status: 'PROPRIA',
      });
      mockPrismaService.tarefas.update.mockResolvedValue({});

      await service.remover('tarefa_1');

      const dados = mockPrismaService.tarefas.update.mock.calls[0][0].data;
      expect(dados.origem_status).toBeUndefined();
      expect(dados.deleted_at).toBeInstanceOf(Date);
    });
  });
});

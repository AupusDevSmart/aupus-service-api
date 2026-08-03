import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService, PermissionScopeService } from '@aupus/api-shared';
import { PlanosManutencaoService } from './planos-manutencao.service';
import { PropagacaoPlanosService } from './propagacao-planos.service';

/**
 * Cobre o que o PR2 introduziu: plano como template de categoria e o vinculo
 * com equipamento por copia. As regras aqui sao as que, se quebrarem, geram
 * dado silenciosamente errado — copia aparecendo na listagem de templates,
 * tarefa nascendo com origem errada, ou plano de outra categoria sendo aceito.
 */
describe('PlanosManutencaoService', () => {
  let service: PlanosManutencaoService;

  const CATEGORIA_MOTOR = 'cat_motor_00000000000000';
  const CATEGORIA_TRAFO = 'cat_trafo_00000000000000';
  const EQUIPAMENTO_UC = 'eq_uc_000000000000000000';
  const MODELO_ID = 'mod_00000000000000000000';
  const TEMPLATE_ID = 'plano_template_0000000000';

  const mockPrismaService: any = {
    planos_manutencao: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    tarefas: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    equipamentos: { findFirst: jest.fn(), findUnique: jest.fn() },
    tipos_equipamentos: { findUnique: jest.fn() },
    categorias_equipamentos: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanosManutencaoService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: PermissionScopeService,
          useValue: {
            assertEntityInScope: jest.fn().mockResolvedValue(undefined),
            getScope: jest.fn().mockResolvedValue(null),
            isScoped: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: PropagacaoPlanosService,
          useValue: {
            enfileirar: jest.fn().mockResolvedValue('propagacao_1'),
            consultar: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<PlanosManutencaoService>(PlanosManutencaoService);
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
  });

  afterEach(() => jest.clearAllMocks());

  describe('criar', () => {
    it('cria template amarrado a uma categoria', async () => {
      mockPrismaService.categorias_equipamentos.findFirst.mockResolvedValue({
        id: CATEGORIA_MOTOR,
        nome: 'Motor',
      });
      mockPrismaService.planos_manutencao.create.mockResolvedValue({
        id: TEMPLATE_ID,
        categoria_id: CATEGORIA_MOTOR,
        plano_origem_id: null,
        nome: 'Preventiva de motor',
        versao: '1.0',
      });

      const result = await service.criar({
        categoria_id: CATEGORIA_MOTOR,
        nome: 'Preventiva de motor',
      });

      expect(result.is_template).toBe(true);
      expect(result.categoria_id).toBe(CATEGORIA_MOTOR);
      expect(mockPrismaService.planos_manutencao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoria_id: CATEGORIA_MOTOR, versao: '1.0' }),
        }),
      );
    });

    it('rejeita categoria inexistente', async () => {
      mockPrismaService.categorias_equipamentos.findFirst.mockResolvedValue(null);

      await expect(
        service.criar({ categoria_id: 'nao_existe', nome: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listar', () => {
    it('devolve apenas templates, nunca copias', async () => {
      mockPrismaService.planos_manutencao.findMany.mockResolvedValue([]);
      mockPrismaService.planos_manutencao.count.mockResolvedValue(0);

      await service.listar({ page: 1, limit: 10 } as any);

      const where = mockPrismaService.planos_manutencao.findMany.mock.calls[0][0].where;
      expect(where.plano_origem_id).toBeNull();
      expect(where.deleted_at).toBeNull();
    });
  });

  describe('vincularEquipamento', () => {
    const equipamentoUC = {
      id: EQUIPAMENTO_UC,
      nome: 'Motor 001',
      classificacao: 'UC',
      unidade: { planta_id: 'planta_0000000000000000' },
    };

    const template = {
      id: TEMPLATE_ID,
      categoria_id: CATEGORIA_MOTOR,
      plano_origem_id: null,
      nome: 'Preventiva de motor',
      descricao: 'desc',
      versao: '1.0',
      tarefas: [
        { id: 'tarefa_template_1', nome: 'Lubrificar', ordem: 1, criticidade: 3, instrucao_id: 'inst_1' },
        { id: 'tarefa_template_2', nome: 'Inspecionar', ordem: 2, criticidade: 4, instrucao_id: 'inst_2' },
      ],
    };

    const prepararCenarioFeliz = () => {
      mockPrismaService.equipamentos.findFirst.mockImplementation(async ({ select }: any) =>
        select?.tipo_equipamento_id ? { tipo_equipamento_id: MODELO_ID } : equipamentoUC,
      );
      mockPrismaService.tipos_equipamentos.findUnique.mockResolvedValue({
        categoria_id: CATEGORIA_MOTOR,
      });
      mockPrismaService.planos_manutencao.findFirst.mockImplementation(async ({ where }: any) =>
        where?.id === TEMPLATE_ID ? template : null,
      );
      mockPrismaService.planos_manutencao.create.mockResolvedValue({ id: 'copia_0000000000000000' });
      mockPrismaService.tarefas.create.mockResolvedValue({});
      mockPrismaService.tarefas.count.mockResolvedValue(0);
    };

    it('copia as tarefas do template marcando todas como HERDADA', async () => {
      prepararCenarioFeliz();

      const result = await service.vincularEquipamento({
        equipamento_id: EQUIPAMENTO_UC,
        plano_id: TEMPLATE_ID,
      });

      expect(result.tarefas_copiadas).toBe(2);
      expect(result.substituiu_vinculo_anterior).toBe(false);

      const origens = mockPrismaService.tarefas.create.mock.calls.map(
        (c: any[]) => c[0].data.origem_status,
      );
      expect(origens).toEqual(['HERDADA', 'HERDADA']);

      // A copia precisa apontar para o template, senao a propagacao nao acha
      const dadosCopia = mockPrismaService.planos_manutencao.create.mock.calls[0][0].data;
      expect(dadosCopia.plano_origem_id).toBe(TEMPLATE_ID);
      expect(dadosCopia.equipamento_id).toBe(EQUIPAMENTO_UC);

      // E cada tarefa precisa apontar para a tarefa de origem
      const origemIds = mockPrismaService.tarefas.create.mock.calls.map(
        (c: any[]) => c[0].data.tarefa_origem_id,
      );
      expect(origemIds).toEqual(['tarefa_template_1', 'tarefa_template_2']);
    });

    it('rejeita equipamento UAR', async () => {
      mockPrismaService.equipamentos.findFirst.mockResolvedValue({
        ...equipamentoUC,
        classificacao: 'UAR',
      });

      await expect(
        service.vincularEquipamento({ equipamento_id: EQUIPAMENTO_UC, plano_id: TEMPLATE_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita plano de outra categoria', async () => {
      prepararCenarioFeliz();
      mockPrismaService.tipos_equipamentos.findUnique.mockResolvedValue({
        categoria_id: CATEGORIA_TRAFO,
      });

      await expect(
        service.vincularEquipamento({ equipamento_id: EQUIPAMENTO_UC, plano_id: TEMPLATE_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita equipamento sem modelo, que nao tem categoria', async () => {
      prepararCenarioFeliz();
      mockPrismaService.equipamentos.findFirst.mockImplementation(async ({ select }: any) =>
        select?.tipo_equipamento_id ? { tipo_equipamento_id: null } : equipamentoUC,
      );

      await expect(
        service.vincularEquipamento({ equipamento_id: EQUIPAMENTO_UC, plano_id: TEMPLATE_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita vincular uma copia em vez de um template', async () => {
      prepararCenarioFeliz();
      mockPrismaService.planos_manutencao.findFirst.mockImplementation(async ({ where }: any) =>
        where?.id === TEMPLATE_ID ? { ...template, plano_origem_id: 'outro_template' } : null,
      );

      await expect(
        service.vincularEquipamento({ equipamento_id: EQUIPAMENTO_UC, plano_id: TEMPLATE_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ao substituir, informa quantas tarefas proprias e customizadas se perdem', async () => {
      prepararCenarioFeliz();

      const copiaAnterior = {
        id: 'copia_anterior_00000000',
        tarefas: [
          { origem_status: 'HERDADA' },
          { origem_status: 'CUSTOMIZADA' },
          { origem_status: 'PROPRIA' },
          { origem_status: 'PROPRIA' },
        ],
      };

      mockPrismaService.planos_manutencao.findFirst.mockImplementation(async ({ where }: any) => {
        if (where?.id === TEMPLATE_ID) return template;
        if (where?.equipamento_id) return copiaAnterior;
        return null;
      });

      const result = await service.vincularEquipamento({
        equipamento_id: EQUIPAMENTO_UC,
        plano_id: TEMPLATE_ID,
      });

      expect(result.substituiu_vinculo_anterior).toBe(true);
      expect(result.tarefas_proprias_descartadas).toBe(2);
      expect(result.tarefas_customizadas_descartadas).toBe(1);

      // A copia anterior sai de vez, liberando o unique de equipamento_id.
      // Seguro porque a OS ja congela o conteudo pedido.
      expect(mockPrismaService.tarefas.deleteMany).toHaveBeenCalledWith({
        where: { plano_manutencao_id: 'copia_anterior_00000000' },
      });
      expect(mockPrismaService.planos_manutencao.delete).toHaveBeenCalledWith({
        where: { id: 'copia_anterior_00000000' },
      });
    });
  });

  describe('desvincularEquipamento', () => {
    it('falha quando o equipamento nao tem plano', async () => {
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue(null);

      await expect(service.desvincularEquipamento(EQUIPAMENTO_UC)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('remove a copia e devolve o que foi perdido', async () => {
      mockPrismaService.planos_manutencao.findFirst.mockResolvedValue({
        id: 'copia_0000000000000000',
        tarefas: [{ origem_status: 'HERDADA' }, { origem_status: 'PROPRIA' }],
      });

      const result = await service.desvincularEquipamento(EQUIPAMENTO_UC);

      expect(result.possui_plano).toBe(true);
      expect(result.tarefas_proprias).toBe(1);
      expect(mockPrismaService.tarefas.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.planos_manutencao.delete).toHaveBeenCalled();
    });
  });

  describe('listarTemplatesDoEquipamento', () => {
    it('devolve vazio quando o equipamento nao tem modelo', async () => {
      mockPrismaService.equipamentos.findFirst.mockResolvedValue({ tipo_equipamento_id: null });

      const result = await service.listarTemplatesDoEquipamento(EQUIPAMENTO_UC);

      expect(result).toEqual([]);
      expect(mockPrismaService.planos_manutencao.findMany).not.toHaveBeenCalled();
    });

    it('filtra pela categoria do modelo e so traz templates', async () => {
      mockPrismaService.equipamentos.findFirst.mockResolvedValue({
        tipo_equipamento_id: MODELO_ID,
      });
      mockPrismaService.tipos_equipamentos.findUnique.mockResolvedValue({
        categoria_id: CATEGORIA_MOTOR,
      });
      mockPrismaService.planos_manutencao.findMany.mockResolvedValue([]);

      await service.listarTemplatesDoEquipamento(EQUIPAMENTO_UC);

      const where = mockPrismaService.planos_manutencao.findMany.mock.calls[0][0].where;
      expect(where.categoria_id).toBe(CATEGORIA_MOTOR);
      expect(where.plano_origem_id).toBeNull();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ProgramacaoOSService } from './programacao-os.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { StatusProgramacaoOS, CondicaoOS, TipoOS, PrioridadeOS, OrigemOS } from '@prisma/client';
import {
  CreateProgramacaoDto,
  UpdateProgramacaoDto,
  ProgramacaoFiltersDto,
  AnalisarProgramacaoDto,
  AprovarProgramacaoDto,
  RejeitarProgramacaoDto,
  CancelarProgramacaoDto,
  CreateProgramacaoAnomaliaDto,
  CreateProgramacaoTarefasDto,
  AdicionarTarefasDto,
  AtualizarTarefasDto,
} from './dto';

describe('ProgramacaoOSService', () => {
  let service: ProgramacaoOSService;
  let prisma: PrismaService;

  const mockProgramacaoData = {
    id: 'clrx1234567890123456789012',
    codigo: 'PRG-2025-001',
    descricao: 'Manutenção preventiva',
    local: 'Planta A',
    ativo: 'Motor 001',
    condicoes: CondicaoOS.FUNCIONANDO,
    status: StatusProgramacaoOS.PENDENTE,
    tipo: TipoOS.PREVENTIVA,
    prioridade: PrioridadeOS.MEDIA,
    origem: OrigemOS.PLANO_MANUTENCAO,
    tempo_estimado: 4.5,
    duracao_estimada: 6.0,
    necessita_veiculo: false,
    criado_em: new Date(),
    atualizado_em: new Date(),
    deletado_em: null,
    tarefas_programacao: [],
    materiais: [],
    ferramentas: [],
    tecnicos: [],
    historico: [],
    ordem_servico: null,
  };

  const mockAnomaliaData = {
    id: 'clrx1234567890123456789012',
    descricao: 'Vazamento de óleo',
    local: 'Planta A',
    ativo: 'Motor 001',
    condicao: 'FUNCIONANDO',
    prioridade: PrioridadeOS.ALTA,
    data: new Date(),
    planta_id: 'clrx1234567890123456789012',
    equipamento_id: 'clrx1234567890123456789012',
    deleted_at: null,
    equipamento: {
      id: 'clrx1234567890123456789012',
      nome: 'Motor 001',
    },
    planta: {
      id: 'clrx1234567890123456789012',
      nome: 'Planta A',
    },
  };

  const mockTarefasData = [
    {
      id: 'clrx1234567890123456789012',
      nome: 'Troca de óleo',
      categoria: 'Mecânica',
      tipo_manutencao: 'PREVENTIVA',
      tempo_estimado: 2.0,
      duracao_estimada: 3.0,
      equipamento_id: 'clrx1234567890123456789012',
      deleted_at: null,
      equipamento: {
        id: 'clrx1234567890123456789012',
        nome: 'Motor 001',
        planta: {
          id: 'clrx1234567890123456789012',
          nome: 'Planta A',
        },
      },
    },
    {
      id: 'clrx9876543210987654321098',
      nome: 'Verificação de filtros',
      categoria: 'Mecânica',
      tipo_manutencao: 'PREVENTIVA',
      tempo_estimado: 1.5,
      duracao_estimada: 2.0,
      equipamento_id: 'clrx1234567890123456789012',
      deleted_at: null,
      equipamento: {
        id: 'clrx1234567890123456789012',
        nome: 'Motor 001',
        planta: {
          id: 'clrx1234567890123456789012',
          nome: 'Planta A',
        },
      },
    },
  ];

  const mockPrismaService = {
    programacoes_os: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    plantas: {
      findFirst: jest.fn(),
    },
    equipamentos: {
      findFirst: jest.fn(),
    },
    anomalias: {
      findFirst: jest.fn(),
    },
    planos_manutencao: {
      findFirst: jest.fn(),
    },
    tarefas: {
      findMany: jest.fn(),
    },
    tarefas_programacao_os: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    materiais_programacao_os: {
      createMany: jest.fn(),
    },
    ferramentas_programacao_os: {
      createMany: jest.fn(),
    },
    tecnicos_programacao_os: {
      createMany: jest.fn(),
    },
    historico_programacao_os: {
      create: jest.fn(),
    },
    ordens_servico: {
      create: jest.fn(),
      count: jest.fn(),
    },
    tarefas_os: {
      createMany: jest.fn(),
    },
    materiais_os: {
      createMany: jest.fn(),
    },
    ferramentas_os: {
      createMany: jest.fn(),
    },
    tecnicos_os: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgramacaoOSService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProgramacaoOSService>(ProgramacaoOSService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('listar', () => {
    it('deve listar programações com filtros', async () => {
      const filters: ProgramacaoFiltersDto = {
        page: 1,
        limit: 10,
        search: 'motor',
        status: StatusProgramacaoOS.PENDENTE,
      };

      const mockStats = [
        { status: StatusProgramacaoOS.PENDENTE, _count: 5 },
        { status: StatusProgramacaoOS.APROVADA, _count: 2 },
      ];

      mockPrismaService.programacoes_os.count.mockResolvedValue(1);
      mockPrismaService.programacoes_os.findMany.mockResolvedValue([mockProgramacaoData]);
      mockPrismaService.programacoes_os.groupBy.mockResolvedValue(mockStats);

      const result = await service.listar(filters);

      expect(prisma.programacoes_os.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletado_em: null,
          status: StatusProgramacaoOS.PENDENTE,
          OR: expect.arrayContaining([
            { descricao: { contains: 'motor', mode: 'insensitive' } },
            { local: { contains: 'motor', mode: 'insensitive' } },
            { ativo: { contains: 'motor', mode: 'insensitive' } },
            { codigo: { contains: 'motor', mode: 'insensitive' } },
          ]),
        }),
      });

      expect(prisma.programacoes_os.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        include: expect.any(Object),
        orderBy: { criado_em: 'desc' },
        skip: 0,
        take: 10,
      });

      expect(result).toEqual({
        data: expect.arrayContaining([expect.objectContaining({
          id: mockProgramacaoData.id,
          descricao: mockProgramacaoData.descricao,
        })]),
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
        stats: expect.any(Object),
      });
    });

    it('deve listar programações sem filtros', async () => {
      const filters: ProgramacaoFiltersDto = {};

      mockPrismaService.programacoes_os.count.mockResolvedValue(0);
      mockPrismaService.programacoes_os.findMany.mockResolvedValue([]);
      mockPrismaService.programacoes_os.groupBy.mockResolvedValue([]);

      const result = await service.listar(filters);

      expect(prisma.programacoes_os.count).toHaveBeenCalledWith({
        where: { deletado_em: null },
      });

      expect(result.data).toEqual([]);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });
  });

  describe('buscarPorId', () => {
    it('deve retornar uma programação por ID', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue(mockProgramacaoData);

      const result = await service.buscarPorId('clrx1234567890123456789012');

      expect(prisma.programacoes_os.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clrx1234567890123456789012',
          deletado_em: null,
        },
        include: expect.any(Object),
      });

      expect(result).toEqual(expect.objectContaining({
        id: mockProgramacaoData.id,
        descricao: mockProgramacaoData.descricao,
        materiais: [],
        ferramentas: [],
        tecnicos: [],
        historico: [],
      }));
    });

    it('deve lançar NotFoundException quando programação não encontrada', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue(null);

      await expect(service.buscarPorId('clrx1234567890123456789012'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('criar', () => {
    const createDto: CreateProgramacaoDto = {
      descricao: 'Manutenção preventiva',
      local: 'Planta A',
      ativo: 'Motor 001',
      condicoes: CondicaoOS.FUNCIONANDO,
      tipo: TipoOS.PREVENTIVA,
      prioridade: PrioridadeOS.MEDIA,
      origem: OrigemOS.PLANO_MANUTENCAO,
      tempo_estimado: 4.5,
      duracao_estimada: 6.0,
    };

    it('deve criar uma programação simples', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.programacoes_os.create.mockResolvedValue(mockProgramacaoData);
      mockPrismaService.programacoes_os.count.mockResolvedValue(0);
      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      const result = await service.criar(createDto, 'user123');

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.programacoes_os.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          codigo: 'PRG-2025-001',
          descricao: createDto.descricao,
          local: createDto.local,
          ativo: createDto.ativo,
          condicoes: createDto.condicoes,
          tipo: createDto.tipo,
          prioridade: createDto.prioridade,
          origem: createDto.origem,
          tempo_estimado: createDto.tempo_estimado,
          duracao_estimada: createDto.duracao_estimada,
          criado_por_id: 'user123',
        }),
        include: expect.any(Object),
      });

      expect(result).toEqual(expect.objectContaining({
        id: mockProgramacaoData.id,
        descricao: mockProgramacaoData.descricao,
      }));
    });

    it('deve criar programação com recursos (materiais, ferramentas, técnicos)', async () => {
      const createDtoCompleto: CreateProgramacaoDto = {
        ...createDto,
        materiais: [{
          descricao: 'Óleo lubrificante',
          quantidade_planejada: 5.5,
          unidade: 'L',
          custo_unitario: 15.50,
        }],
        ferramentas: [{
          descricao: 'Chave inglesa',
          quantidade: 1,
        }],
        tecnicos: [{
          nome: 'João Silva',
          especialidade: 'Mecânico',
          horas_estimadas: 4.0,
          custo_hora: 50.00,
        }],
        tarefas_ids: ['clrx1234567890123456789012'],
      };

      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.programacoes_os.create.mockResolvedValue(mockProgramacaoData);
      mockPrismaService.programacoes_os.count.mockResolvedValue(0);
      mockPrismaService.tarefas.findMany.mockResolvedValue([mockTarefasData[0]]);
      mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([]);
      mockPrismaService.tarefas_programacao_os.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.materiais_programacao_os.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.ferramentas_programacao_os.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.tecnicos_programacao_os.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      const result = await service.criar(createDtoCompleto, 'user123');

      expect(mockPrismaService.tarefas.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['clrx1234567890123456789012'] },
          deleted_at: null,
        },
      });

      expect(mockPrismaService.materiais_programacao_os.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            descricao: 'Óleo lubrificante',
            quantidade_planejada: 5.5,
            unidade: 'L',
            custo_unitario: 15.50,
          }),
        ]),
      });

      expect(result).toEqual(expect.objectContaining({
        id: mockProgramacaoData.id,
      }));
    });

    it('deve validar relacionamentos antes de criar', async () => {
      const createDtoComRelacionamentos: CreateProgramacaoDto = {
        ...createDto,
        equipamento_id: 'clrx9876543210987654321098',
      };

      mockPrismaService.equipamentos.findFirst.mockResolvedValue(null);

      await expect(service.criar(createDtoComRelacionamentos, 'user123'))
        .rejects.toThrow(NotFoundException);

      expect(mockPrismaService.equipamentos.findFirst).toHaveBeenCalledWith({
        where: { id: 'clrx9876543210987654321098', deleted_at: null },
      });
    });
  });

  describe('atualizar', () => {
    const updateDto: UpdateProgramacaoDto = {
      descricao: 'Manutenção preventiva atualizada',
      tempo_estimado: 5.0,
    };

    it('deve atualizar uma programação em status editável', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.PENDENTE,
      });

      mockPrismaService.programacoes_os.update.mockResolvedValue({
        ...mockProgramacaoData,
        ...updateDto,
      });

      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      const result = await service.atualizar('clrx1234567890123456789012', updateDto, 'user123');

      expect(mockPrismaService.programacoes_os.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: expect.objectContaining(updateDto),
        include: expect.any(Object),
      });

      expect(result.descricao).toBe(updateDto.descricao);
      expect(result.tempo_estimado).toBe(updateDto.tempo_estimado);
    });

    it('deve lançar ConflictException para programação não editável', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.APROVADA,
      });

      await expect(service.atualizar('clrx1234567890123456789012', updateDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('analisar', () => {
    const analisarDto: AnalisarProgramacaoDto = {
      observacoes_analise: 'Iniciando análise técnica',
    };

    it('deve iniciar análise de programação pendente', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.PENDENTE,
      });

      mockPrismaService.programacoes_os.update.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.EM_ANALISE,
      });

      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.analisar('clrx1234567890123456789012', analisarDto, 'user123');

      expect(mockPrismaService.programacoes_os.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: {
          status: StatusProgramacaoOS.EM_ANALISE,
          analisado_por_id: 'user123',
          data_analise: expect.any(Date),
        },
      });
    });

    it('deve lançar ConflictException para status inadequado', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.APROVADA,
      });

      await expect(service.analisar('clrx1234567890123456789012', analisarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('aprovar', () => {
    const aprovarDto: AprovarProgramacaoDto = {
      observacoes_aprovacao: 'Aprovado para execução',
      ajustes_orcamento: 1500.00,
    };

    it('deve aprovar programação em análise e gerar OS', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);

      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.EM_ANALISE,
      });

      mockPrismaService.programacoes_os.update.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.APROVADA,
      });

      mockPrismaService.programacoes_os.findUnique.mockResolvedValue({
        ...mockProgramacaoData,
        tarefas_programacao: [],
        materiais: [],
        ferramentas: [],
        tecnicos: [],
      });

      mockPrismaService.ordens_servico.count.mockResolvedValue(0);
      mockPrismaService.ordens_servico.create.mockResolvedValue({
        id: 'clrx1234567890123456789012',
        numero_os: 'OS-2025-001',
      });

      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.aprovar('clrx1234567890123456789012', aprovarDto, 'user123');

      expect(mockPrismaService.programacoes_os.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: expect.objectContaining({
          status: StatusProgramacaoOS.APROVADA,
          aprovado_por_id: 'user123',
          data_aprovacao: expect.any(Date),
          orcamento_previsto: aprovarDto.ajustes_orcamento,
        }),
      });

      expect(mockPrismaService.ordens_servico.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException para status inadequado', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.PENDENTE,
      });

      await expect(service.aprovar('clrx1234567890123456789012', aprovarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('rejeitar', () => {
    const rejeitarDto: RejeitarProgramacaoDto = {
      motivo_rejeicao: 'Dados insuficientes',
      sugestoes_melhoria: 'Adicionar mais detalhes',
    };

    it('deve rejeitar programação em análise', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.EM_ANALISE,
      });

      mockPrismaService.programacoes_os.update.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.REJEITADA,
      });

      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.rejeitar('clrx1234567890123456789012', rejeitarDto, 'user123');

      expect(mockPrismaService.programacoes_os.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: {
          status: StatusProgramacaoOS.REJEITADA,
          motivo_rejeicao: rejeitarDto.motivo_rejeicao,
        },
      });
    });
  });

  describe('cancelar', () => {
    const cancelarDto: CancelarProgramacaoDto = {
      motivo_cancelamento: 'Equipamento não disponível',
    };

    it('deve cancelar programação em status válido', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.PENDENTE,
      });

      mockPrismaService.programacoes_os.update.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.CANCELADA,
      });

      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.cancelar('clrx1234567890123456789012', cancelarDto, 'user123');

      expect(mockPrismaService.programacoes_os.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: {
          status: StatusProgramacaoOS.CANCELADA,
          motivo_cancelamento: cancelarDto.motivo_cancelamento,
        },
      });
    });

    it('deve lançar ConflictException para status não cancelável', async () => {
      mockPrismaService.programacoes_os.findFirst.mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.APROVADA,
      });

      await expect(service.cancelar('clrx1234567890123456789012', cancelarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('criarDeAnomalia', () => {
    const createAnomaliaDto: CreateProgramacaoAnomaliaDto = {
      ajustes: {
        descricao: 'Correção urgente',
        prioridade: 'ALTA',
        tempo_estimado: 3.0,
      },
    };

    it('deve criar programação a partir de anomalia', async () => {
      mockPrismaService.anomalias.findFirst.mockResolvedValue(mockAnomaliaData);

      // Mock do método criar
      jest.spyOn(service, 'criar').mockResolvedValue(mockProgramacaoData as any);

      const result = await service.criarDeAnomalia('clrx1234567890123456789012', createAnomaliaDto, 'user123');

      expect(mockPrismaService.anomalias.findFirst).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012', deleted_at: null },
        include: {
          equipamento: true,
          planta: true,
        },
      });

      expect(service.criar).toHaveBeenCalledWith(
        expect.objectContaining({
          descricao: createAnomaliaDto.ajustes?.descricao,
          local: mockAnomaliaData.local,
          ativo: mockAnomaliaData.ativo,
          tipo: 'CORRETIVA',
          origem: 'ANOMALIA',
          anomalia_id: mockAnomaliaData.id,
          dados_origem: expect.objectContaining({
            anomalia_descricao: mockAnomaliaData.descricao,
            anomalia_data: mockAnomaliaData.data,
            anomalia_prioridade: mockAnomaliaData.prioridade,
          }),
        }),
        'user123'
      );

      expect(result).toEqual(mockProgramacaoData);
    });

    it('deve lançar NotFoundException quando anomalia não encontrada', async () => {
      mockPrismaService.anomalias.findFirst.mockResolvedValue(null);

      await expect(service.criarDeAnomalia('clrx1234567890123456789012', createAnomaliaDto, 'user123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('criarDeTarefas', () => {
    const createTarefasDto: CreateProgramacaoTarefasDto = {
      tarefas_ids: ['clrx1234567890123456789012', 'clrx9876543210987654321098'],
      descricao: 'Manutenção preventiva agrupada',
      prioridade: 'MEDIA',
      agrupar_por: 'equipamento',
    };

    it('deve criar programação de múltiplas tarefas', async () => {
      mockPrismaService.tarefas.findMany.mockResolvedValue(mockTarefasData);

      // Mock do método criar
      jest.spyOn(service, 'criar').mockResolvedValue(mockProgramacaoData as any);

      const result = await service.criarDeTarefas(createTarefasDto, 'user123');

      expect(mockPrismaService.tarefas.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: createTarefasDto.tarefas_ids },
          deleted_at: null,
        },
        include: {
          equipamento: {
            include: { planta: true },
          },
        },
      });

      expect(service.criar).toHaveBeenCalledWith(
        expect.objectContaining({
          descricao: createTarefasDto.descricao,
          tempo_estimado: 3.5, // 2.0 + 1.5
          duracao_estimada: 5.0, // 3.0 + 2.0
          tarefas_ids: createTarefasDto.tarefas_ids,
          dados_origem: expect.objectContaining({
            tarefas_count: 2,
            agrupamento: 'equipamento',
            tarefas_nomes: ['Troca de óleo', 'Verificação de filtros'],
          }),
        }),
        'user123'
      );

      expect(result).toEqual(mockProgramacaoData);
    });

    it('deve lançar NotFoundException quando tarefas não encontradas', async () => {
      mockPrismaService.tarefas.findMany.mockResolvedValue([mockTarefasData[0]]); // Apenas 1 de 2

      await expect(service.criarDeTarefas(createTarefasDto, 'user123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('adicionarTarefasProgramacao', () => {
    const adicionarTarefasDto: AdicionarTarefasDto = {
      tarefas_ids: ['clrx9876543210987654321098'],
      observacoes: 'Tarefas adicionais necessárias',
    };

    it('deve adicionar tarefas à programação', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);

      // Mock do buscarPorId
      jest.spyOn(service, 'buscarPorId').mockResolvedValue(mockProgramacaoData as any);

      mockPrismaService.tarefas.findMany.mockResolvedValue([mockTarefasData[1]]);
      mockPrismaService.tarefas_programacao_os.findMany.mockResolvedValue([]);
      mockPrismaService.tarefas_programacao_os.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.adicionarTarefasProgramacao('clrx1234567890123456789012', adicionarTarefasDto, 'user123');

      expect(service.buscarPorId).toHaveBeenCalledWith('clrx1234567890123456789012');
      expect(mockPrismaService.tarefas_programacao_os.createMany).toHaveBeenCalled();
    });
  });

  describe('atualizarTarefasProgramacao', () => {
    const atualizarTarefasDto: AtualizarTarefasDto = {
      tarefas: [
        {
          tarefa_id: 'clrx1234567890123456789012',
          ordem: 1,
          status: 'PENDENTE',
          observacoes: 'Tarefa prioritária',
        },
      ],
    };

    it('deve atualizar tarefas da programação', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);

      // Mock do buscarPorId
      jest.spyOn(service, 'buscarPorId').mockResolvedValue(mockProgramacaoData as any);

      mockPrismaService.tarefas_programacao_os.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.atualizarTarefasProgramacao('clrx1234567890123456789012', atualizarTarefasDto, 'user123');

      expect(mockPrismaService.tarefas_programacao_os.updateMany).toHaveBeenCalledWith({
        where: {
          programacao_id: 'clrx1234567890123456789012',
          tarefa_id: 'clrx1234567890123456789012',
        },
        data: {
          ordem: 1,
          status: 'PENDENTE',
          observacoes: 'Tarefa prioritária',
        },
      });
    });
  });

  describe('removerTarefaProgramacao', () => {
    it('deve remover tarefa da programação', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);

      // Mock do buscarPorId
      jest.spyOn(service, 'buscarPorId').mockResolvedValue(mockProgramacaoData as any);

      mockPrismaService.tarefas_programacao_os.findFirst.mockResolvedValue({
        id: 'clrx1234567890123456789012',
        programacao_id: 'clrx1234567890123456789012',
        tarefa_id: 'clrx9876543210987654321098',
        tarefa: { nome: 'Troca de óleo' },
      });

      mockPrismaService.tarefas_programacao_os.delete.mockResolvedValue({});
      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.removerTarefaProgramacao('clrx1234567890123456789012', 'clrx9876543210987654321098', 'user123');

      expect(mockPrismaService.tarefas_programacao_os.delete).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
      });
    });

    it('deve lançar NotFoundException quando tarefa não encontrada na programação', async () => {
      // Mock do buscarPorId
      jest.spyOn(service, 'buscarPorId').mockResolvedValue(mockProgramacaoData as any);

      mockPrismaService.tarefas_programacao_os.findFirst.mockResolvedValue(null);

      await expect(service.removerTarefaProgramacao('clrx1234567890123456789012', 'clrx9876543210987654321098', 'user123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('deletar', () => {
    it('deve deletar programação (soft delete)', async () => {
      // Mock do buscarPorId
      jest.spyOn(service, 'buscarPorId').mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.PENDENTE,
      } as any);

      mockPrismaService.programacoes_os.update.mockResolvedValue({});
      mockPrismaService.historico_programacao_os.create.mockResolvedValue({});

      await service.deletar('clrx1234567890123456789012', 'user123');

      expect(mockPrismaService.programacoes_os.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: { deletado_em: expect.any(Date) },
      });
    });

    it('deve lançar ConflictException para programação aprovada', async () => {
      // Mock do buscarPorId
      jest.spyOn(service, 'buscarPorId').mockResolvedValue({
        ...mockProgramacaoData,
        status: StatusProgramacaoOS.APROVADA,
      } as any);

      await expect(service.deletar('clrx1234567890123456789012', 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });
});
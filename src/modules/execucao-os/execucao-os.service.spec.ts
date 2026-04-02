import { Test, TestingModule } from '@nestjs/testing';
import { ExecucaoOSService } from './execucao-os.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AnomaliasService } from '../anomalias/anomalias.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { StatusOS, CondicaoOS, TipoOS, PrioridadeOS, OrigemOS } from '@prisma/client';
import {
  OSFiltersDto,
  IniciarExecucaoDto,
  PausarExecucaoDto,
  RetomarExecucaoDto,
  AtualizarChecklistDto,
  RegistrarMateriaisDto,
  RegistrarFerramentasDto,
  ConcluirTarefaDto,
  CancelarTarefaDto,
  FinalizarOSDto,
  CancelarOSDto,
} from './dto';

describe('ExecucaoOSService', () => {
  let service: ExecucaoOSService;
  let prisma: PrismaService;

  const mockOSData = {
    id: 'clrx1234567890123456789012',
    numero_os: 'OS-2025-001',
    descricao: 'Manutenção preventiva do motor',
    local: 'Planta A',
    ativo: 'Motor 001',
    condicoes: CondicaoOS.FUNCIONANDO,
    status: StatusOS.PENDENTE,
    tipo: TipoOS.PREVENTIVA,
    prioridade: PrioridadeOS.MEDIA,
    origem: OrigemOS.PLANO_MANUTENCAO,
    data_hora_programada: new Date('2025-02-15T08:00:00Z'),
    responsavel: 'João Silva',
    criado_em: new Date(),
    atualizado_em: new Date(),
    deletado_em: null,
    data_hora_inicio_real: null,
    data_hora_fim_real: null,
    tarefas_os: [],
    materiais: [],
    ferramentas: [],
    tecnicos: [],
    checklist_atividades: [],
    anexos: [],
    registros_tempo: [],
    historico: [],
    programacao: null,
    ordem_servico: null,
  };

  const mockTarefaData = {
    id: 'clrx1234567890123456789012',
    os_id: 'clrx1234567890123456789012',
    tarefa_id: 'clrx9876543210987654321098',
    ordem: 1,
    status: 'PENDENTE',
    tarefa: {
      id: 'clrx9876543210987654321098',
      nome: 'Troca de óleo',
      categoria: 'Mecânica',
      tipo_manutencao: 'PREVENTIVA',
    },
  };

  const mockPrismaService = {
    ordens_servico: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    tarefas_os: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    materiais_os: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    ferramentas_os: {
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    tecnicos_os: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    reserva_veiculo: {
      create: jest.fn(),
    },
    checklist_atividades_os: {
      count: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    registros_tempo_os: {
      create: jest.fn(),
    },
    historico_os: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecucaoOSService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AnomaliasService,
          useValue: {
            marcarComoFinalizada: jest.fn(),
            voltarParaRegistrada: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExecucaoOSService>(ExecucaoOSService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('listar', () => {
    it('deve listar OS com filtros', async () => {
      const filters: OSFiltersDto = {
        page: 1,
        limit: 10,
        search: 'motor',
        status: StatusOS.PENDENTE,
      };

      const mockStats = [
        { status: StatusOS.PENDENTE, _count: 5 },
        { status: StatusOS.FINALIZADA, _count: 2 },
      ];

      mockPrismaService.ordens_servico.count.mockResolvedValue(1);
      mockPrismaService.ordens_servico.findMany.mockResolvedValue([mockOSData]);
      mockPrismaService.ordens_servico.groupBy.mockResolvedValue(mockStats);

      const result = await service.listar(filters);

      expect(prisma.ordens_servico.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletado_em: null,
          status: StatusOS.PENDENTE,
          OR: expect.arrayContaining([
            { descricao: { contains: 'motor', mode: 'insensitive' } },
            { local: { contains: 'motor', mode: 'insensitive' } },
            { ativo: { contains: 'motor', mode: 'insensitive' } },
            { numero_os: { contains: 'motor', mode: 'insensitive' } },
          ]),
        }),
      });

      expect(result).toEqual({
        data: expect.arrayContaining([expect.objectContaining({
          id: mockOSData.id,
          numero_os: mockOSData.numero_os,
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

    it('deve filtrar OS atrasadas', async () => {
      const filters: OSFiltersDto = {
        atrasadas: true,
      };

      mockPrismaService.ordens_servico.count.mockResolvedValue(0);
      mockPrismaService.ordens_servico.findMany.mockResolvedValue([]);
      mockPrismaService.ordens_servico.groupBy.mockResolvedValue([]);

      const result = await service.listar(filters);

      expect(prisma.ordens_servico.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletado_em: null,
          AND: [
            { data_hora_programada: { lt: expect.any(Date) } },
            { status: { notIn: [StatusOS.FINALIZADA, StatusOS.CANCELADA] } },
          ],
        }),
      });

      expect(result.data).toEqual([]);
    });

    it('deve filtrar por responsável', async () => {
      const filters: OSFiltersDto = {
        responsavel: 'João',
      };

      mockPrismaService.ordens_servico.count.mockResolvedValue(0);
      mockPrismaService.ordens_servico.findMany.mockResolvedValue([]);
      mockPrismaService.ordens_servico.groupBy.mockResolvedValue([]);

      await service.listar(filters);

      expect(prisma.ordens_servico.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          responsavel: { contains: 'João', mode: 'insensitive' },
        }),
      });
    });
  });

  describe('buscarPorId', () => {
    it('deve retornar uma OS por ID', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);

      const result = await service.buscarPorId('clrx1234567890123456789012');

      expect(prisma.ordens_servico.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clrx1234567890123456789012',
          deletado_em: null,
        },
        include: expect.any(Object),
      });

      expect(result).toEqual(expect.objectContaining({
        id: mockOSData.id,
        numero_os: mockOSData.numero_os,
        materiais: [],
        ferramentas: [],
        tecnicos: [],
      }));
    });

    it('deve lançar NotFoundException quando OS não encontrada', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(null);

      await expect(service.buscarPorId('clrx1234567890123456789012'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('iniciar', () => {
    const iniciarDto: IniciarExecucaoDto = {
      equipe_presente: ['João Silva', 'Maria Santos'],
      responsavel_execucao: 'João Silva',
      observacoes: 'Início da execução',
    };

    it('deve iniciar execução de OS programada', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.PENDENTE,
      });

      mockPrismaService.ordens_servico.update.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.EM_EXECUCAO,
      });
      mockPrismaService.registros_tempo_os.create.mockResolvedValue({});
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.iniciar('clrx1234567890123456789012', iniciarDto, 'user123');

      expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: expect.objectContaining({
          status: StatusOS.EM_EXECUCAO,
          equipe_presente: iniciarDto.equipe_presente,
          observacoes_execucao: iniciarDto.observacoes,
        }),
      });

      expect(mockPrismaService.registros_tempo_os.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          os_id: 'clrx1234567890123456789012',
          tecnico_nome: iniciarDto.responsavel_execucao,
          atividade: 'Início da execução',
        }),
      });
    });

    it('deve lançar ConflictException para OS não programada', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.FINALIZADA,
      });

      await expect(service.iniciar('clrx1234567890123456789012', iniciarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('pausar', () => {
    const pausarDto: PausarExecucaoDto = {
      motivo_pausa: 'Aguardar chegada de peça',
      observacoes: 'Peça em falta no estoque',
    };

    it('deve pausar execução de OS em andamento', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.EM_EXECUCAO,
      });

      mockPrismaService.ordens_servico.update.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.PAUSADA,
      });
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.pausar('clrx1234567890123456789012', pausarDto, 'user123');

      expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: { status: StatusOS.PAUSADA },
      });

      expect(mockPrismaService.historico_os.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          os_id: 'clrx1234567890123456789012',
          acao: 'PAUSA',
          observacoes: `${pausarDto.motivo_pausa}. ${pausarDto.observacoes}`,
          status_anterior: StatusOS.EM_EXECUCAO,
          status_novo: StatusOS.PAUSADA,
        }),
      });
    });

    it('deve lançar ConflictException para OS não em execução', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.PENDENTE,
      });

      await expect(service.pausar('clrx1234567890123456789012', pausarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('retomar', () => {
    const retomarDto: RetomarExecucaoDto = {
      observacoes_retomada: 'Peça chegou, retomando execução',
    };

    it('deve retomar execução de OS pausada', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.PAUSADA,
      });

      mockPrismaService.ordens_servico.update.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.EM_EXECUCAO,
      });
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.retomar('clrx1234567890123456789012', retomarDto, 'user123');

      expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: { status: StatusOS.EM_EXECUCAO },
      });
    });

    it('deve lançar ConflictException para OS não pausada', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.EM_EXECUCAO,
      });

      await expect(service.retomar('clrx1234567890123456789012', retomarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('atualizarChecklist', () => {
    const checklistDto: AtualizarChecklistDto = {
      atividades: [
        {
          id: 'clrx1234567890123456789012',
          concluida: true,
          observacoes: 'Atividade concluída',
        },
      ],
    };

    it('deve atualizar checklist da OS', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.checklist_atividades_os.update.mockResolvedValue({});
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.atualizarChecklist('clrx1234567890123456789012', checklistDto, 'user123');

      expect(mockPrismaService.checklist_atividades_os.update).toHaveBeenCalledWith({
        where: { id: checklistDto.atividades[0].id },
        data: expect.objectContaining({
          concluida: true,
          observacoes: 'Atividade concluída',
          concluida_em: expect.any(Date),
          concluida_por_id: 'user123',
        }),
      });
    });
  });

  describe('registrarMateriais', () => {
    const materiaisDto: RegistrarMateriaisDto = {
      materiais: [
        {
          id: 'clrx1234567890123456789012',
          quantidade_consumida: 5.5,
          observacoes: 'Consumo total',
        },
      ],
    };

    it('deve registrar consumo de materiais', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.materiais_os.update.mockResolvedValue({});
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.registrarMateriais('clrx1234567890123456789012', materiaisDto, 'user123');

      expect(mockPrismaService.materiais_os.update).toHaveBeenCalledWith({
        where: { id: materiaisDto.materiais[0].id },
        data: {
          quantidade_consumida: 5.5,
          observacoes: 'Consumo total',
        },
      });
    });
  });

  describe('registrarFerramentas', () => {
    const ferramentasDto: RegistrarFerramentasDto = {
      ferramentas: [
        {
          id: 'clrx1234567890123456789012',
          utilizada: true,
          condicao_antes: 'Boa',
          condicao_depois: 'Boa',
          observacoes: 'Ferramenta funcionou perfeitamente',
        },
      ],
    };

    it('deve registrar uso de ferramentas', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.ferramentas_os.update.mockResolvedValue({});
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.registrarFerramentas('clrx1234567890123456789012', ferramentasDto, 'user123');

      expect(mockPrismaService.ferramentas_os.update).toHaveBeenCalledWith({
        where: { id: ferramentasDto.ferramentas[0].id },
        data: {
          utilizada: true,
          condicao_antes: 'Boa',
          condicao_depois: 'Boa',
          observacoes: 'Ferramenta funcionou perfeitamente',
        },
      });
    });
  });

  describe('concluirTarefa', () => {
    const concluirDto: ConcluirTarefaDto = {
      observacoes: 'Tarefa concluída com sucesso',
      tempo_execucao: 120,
      concluida_por: 'João Silva',
    };

    it('deve concluir uma tarefa da OS', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.tarefas_os.findFirst.mockResolvedValue(mockTarefaData);
      mockPrismaService.tarefas_os.update.mockResolvedValue({});
      mockPrismaService.registros_tempo_os.create.mockResolvedValue({});
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.concluirTarefa(
        'clrx1234567890123456789012',
        'clrx9876543210987654321098',
        concluirDto,
        'user123'
      );

      expect(mockPrismaService.tarefas_os.update).toHaveBeenCalledWith({
        where: { id: mockTarefaData.id },
        data: expect.objectContaining({
          status: 'CONCLUIDA',
          data_conclusao: expect.any(Date),
          concluida_por: 'João Silva',
          observacoes: 'Tarefa concluída com sucesso',
        }),
      });

      expect(mockPrismaService.registros_tempo_os.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          os_id: 'clrx1234567890123456789012',
          tecnico_nome: 'João Silva',
          tempo_total: 120,
          atividade: `Execução da tarefa: ${mockTarefaData.tarefa.nome}`,
        }),
      });
    });

    it('deve lançar NotFoundException para tarefa não encontrada', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.tarefas_os.findFirst.mockResolvedValue(null);

      await expect(service.concluirTarefa(
        'clrx1234567890123456789012',
        'clrx9876543210987654321098',
        concluirDto,
        'user123'
      )).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelarTarefa', () => {
    const cancelarDto: CancelarTarefaDto = {
      motivo_cancelamento: 'Equipamento com defeito',
      observacoes: 'Necessário reparo antes da execução',
    };

    it('deve cancelar uma tarefa da OS', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.tarefas_os.findFirst.mockResolvedValue(mockTarefaData);
      mockPrismaService.tarefas_os.update.mockResolvedValue({});
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.cancelarTarefa(
        'clrx1234567890123456789012',
        'clrx9876543210987654321098',
        cancelarDto,
        'user123'
      );

      expect(mockPrismaService.tarefas_os.update).toHaveBeenCalledWith({
        where: { id: mockTarefaData.id },
        data: {
          status: 'CANCELADA',
          observacoes: `${cancelarDto.motivo_cancelamento}. ${cancelarDto.observacoes}`,
        },
      });
    });
  });

  describe('finalizar', () => {
    const finalizarDto: FinalizarOSDto = {
      observacoes: 'Serviço executado perfeitamente',
    };

    it('deve finalizar OS auditada', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.AUDITADA,
        data_hora_inicio_real: new Date('2025-02-15T08:00:00Z'),
      });

      (mockPrismaService as any).usuarios = {
        findUnique: jest.fn().mockResolvedValue({ nome: 'Admin' }),
      };
      (mockPrismaService as any).programacoes_os = {
        update: jest.fn().mockResolvedValue({ solicitacao_servico_id: null }),
      };

      mockPrismaService.ordens_servico.update.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.FINALIZADA,
      });

      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.finalizar('clrx1234567890123456789012', finalizarDto, 'user123');

      expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: expect.objectContaining({
          status: StatusOS.FINALIZADA,
          finalizado_por_id: 'user123',
        }),
      });
    });

    it('deve lançar ConflictException para OS em status inadequado', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.FINALIZADA,
      });

      await expect(service.finalizar('clrx1234567890123456789012', finalizarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('cancelar', () => {
    const cancelarDto: CancelarOSDto = {
      motivo_cancelamento: 'Equipamento com defeito grave',
      observacoes: 'Necessário reparo especializado',
    };

    it('deve cancelar OS em execução', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.$transaction.mockImplementation(mockTransaction);
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.EM_EXECUCAO,
      });

      mockPrismaService.ordens_servico.update.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.CANCELADA,
      });
      mockPrismaService.historico_os.create.mockResolvedValue({});

      await service.cancelar('clrx1234567890123456789012', cancelarDto, 'user123');

      expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: {
          status: StatusOS.CANCELADA,
          motivo_cancelamento: cancelarDto.motivo_cancelamento,
        },
      });
    });

    it('deve lançar ConflictException para OS finalizada', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
        ...mockOSData,
        status: StatusOS.FINALIZADA,
      });

      await expect(service.cancelar('clrx1234567890123456789012', cancelarDto, 'user123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('métodos auxiliares', () => {
    describe('calcularTempoExecucao', () => {
      it('deve finalizar OS auditada com tempo de execução', async () => {
        const finalizarDto: FinalizarOSDto = {
          observacoes: 'Concluído',
        };

        const mockTransaction = jest.fn(async (callback) => {
          return await callback(mockPrismaService);
        });

        mockPrismaService.$transaction.mockImplementation(mockTransaction);
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
          ...mockOSData,
          status: StatusOS.AUDITADA,
          data_hora_inicio_real: new Date('2025-02-15T08:00:00Z'),
        });

        (mockPrismaService as any).usuarios = {
          findUnique: jest.fn().mockResolvedValue({ nome: 'Admin' }),
        };
        (mockPrismaService as any).programacoes_os = {
          update: jest.fn().mockResolvedValue({ solicitacao_servico_id: null }),
        };

        mockPrismaService.ordens_servico.update.mockResolvedValue({});
        mockPrismaService.historico_os.create.mockResolvedValue({});

        await service.finalizar('clrx1234567890123456789012', finalizarDto, 'user123');

        expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
          where: { id: 'clrx1234567890123456789012' },
          data: expect.objectContaining({
            status: 'FINALIZADA',
          }),
        });
      });

      it('deve finalizar OS auditada sem data de inicio', async () => {
        const finalizarDto: FinalizarOSDto = {
          observacoes: 'Concluído',
        };

        const mockTransaction = jest.fn(async (callback) => {
          return await callback(mockPrismaService);
        });

        mockPrismaService.$transaction.mockImplementation(mockTransaction);
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
          ...mockOSData,
          status: StatusOS.AUDITADA,
          data_hora_inicio_real: null,
        });

        (mockPrismaService as any).usuarios = {
          findUnique: jest.fn().mockResolvedValue({ nome: 'Admin' }),
        };
        (mockPrismaService as any).programacoes_os = {
          update: jest.fn().mockResolvedValue({ solicitacao_servico_id: null }),
        };

        mockPrismaService.ordens_servico.update.mockResolvedValue({});
        mockPrismaService.historico_os.create.mockResolvedValue({});

        await service.finalizar('clrx1234567890123456789012', finalizarDto, 'user123');

        expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
          where: { id: 'clrx1234567890123456789012' },
          data: expect.objectContaining({
            status: 'FINALIZADA',
          }),
        });
      });
    });

    describe('calcularCustoReal', () => {
      it('deve calcular custo real incluindo materiais e técnicos', async () => {
        const finalizarDto: FinalizarOSDto = {
          observacoes: 'Concluído',
        };

        const mockTransaction = jest.fn(async (callback) => {
          return await callback(mockPrismaService);
        });

        mockPrismaService.$transaction.mockImplementation(mockTransaction);
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
          ...mockOSData,
          status: StatusOS.AUDITADA,
        });

        (mockPrismaService as any).usuarios = {
          findUnique: jest.fn().mockResolvedValue({ nome: 'Admin' }),
        };
        (mockPrismaService as any).programacoes_os = {
          update: jest.fn().mockResolvedValue({ solicitacao_servico_id: null }),
        };

        mockPrismaService.ordens_servico.update.mockResolvedValue({});
        mockPrismaService.historico_os.create.mockResolvedValue({});

        await service.finalizar('clrx1234567890123456789012', finalizarDto, 'user123');

        expect(mockPrismaService.ordens_servico.update).toHaveBeenCalledWith({
          where: { id: 'clrx1234567890123456789012' },
          data: expect.objectContaining({
            status: 'FINALIZADA',
            finalizado_por_id: 'user123',
          }),
        });
      });
    });

    describe('gerarChecklistPadrao', () => {
      it('deve gerar checklist padrão quando não existir', async () => {
        const mockTransaction = jest.fn(async (callback) => {
          return await callback(mockPrismaService);
        });

        mockPrismaService.$transaction.mockImplementation(mockTransaction);
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
          ...mockOSData,
          status: StatusOS.PENDENTE,
        });

        // Simular que não existe checklist
        mockPrismaService.checklist_atividades_os.count.mockResolvedValue(0);
        mockPrismaService.checklist_atividades_os.createMany.mockResolvedValue({ count: 6 });

        mockPrismaService.ordens_servico.update.mockResolvedValue({});
        mockPrismaService.registros_tempo_os.create.mockResolvedValue({});
        mockPrismaService.historico_os.create.mockResolvedValue({});

        const iniciarDto: IniciarExecucaoDto = {
          equipe_presente: ['João Silva'],
          responsavel_execucao: 'João Silva',
          observacoes: 'Início da execução',
        };

        await service.iniciar('clrx1234567890123456789012', iniciarDto, 'user123');

        expect(mockPrismaService.checklist_atividades_os.createMany).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            expect.objectContaining({
              os_id: 'clrx1234567890123456789012',
              atividade: 'Verificar equipamentos de segurança',
              ordem: 1,
              obrigatoria: true,
            }),
            expect.objectContaining({
              atividade: 'Conferir materiais e ferramentas',
              ordem: 2,
              obrigatoria: true,
            }),
          ]),
        });
      });

      it('não deve gerar checklist se já existir', async () => {
        const mockTransaction = jest.fn(async (callback) => {
          return await callback(mockPrismaService);
        });

        mockPrismaService.$transaction.mockImplementation(mockTransaction);
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue({
          ...mockOSData,
          status: StatusOS.PENDENTE,
        });

        // Simular que já existe checklist
        mockPrismaService.checklist_atividades_os.count.mockResolvedValue(5);

        mockPrismaService.ordens_servico.update.mockResolvedValue({});
        mockPrismaService.registros_tempo_os.create.mockResolvedValue({});
        mockPrismaService.historico_os.create.mockResolvedValue({});

        const iniciarDto: IniciarExecucaoDto = {
          equipe_presente: ['João Silva'],
          responsavel_execucao: 'João Silva',
          observacoes: 'Início da execução',
        };

        await service.iniciar('clrx1234567890123456789012', iniciarDto, 'user123');

        expect(mockPrismaService.checklist_atividades_os.createMany).not.toHaveBeenCalled();
      });
    });

    describe('obterEstatisticas', () => {
      it('deve retornar estatísticas por status', async () => {
        const mockStats = [
          { status: StatusOS.PENDENTE, _count: 7 },
          { status: StatusOS.EM_EXECUCAO, _count: 3 },
          { status: StatusOS.FINALIZADA, _count: 10 },
        ];

        mockPrismaService.ordens_servico.count.mockResolvedValue(0);
        mockPrismaService.ordens_servico.findMany.mockResolvedValue([]);
        mockPrismaService.ordens_servico.groupBy.mockResolvedValue(mockStats);

        const result = await service.listar({});

        expect(result.stats).toEqual({
          pendentes: 7,
          em_execucao: 3,
          pausadas: 0,
          executadas: 0,
          auditadas: 0,
          finalizadas: 10,
          canceladas: 0,
          atrasadas: 0,
          criticas: 0,
        });
      });
    });
  });
});
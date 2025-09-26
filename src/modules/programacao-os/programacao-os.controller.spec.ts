import { Test, TestingModule } from '@nestjs/testing';
import { ProgramacaoOSController } from './programacao-os.controller';
import { ProgramacaoOSService } from './programacao-os.service';
import { CreateProgramacaoDto } from './dto/create-programacao.dto';
import { UpdateProgramacaoDto } from './dto/update-programacao.dto';
import { ProgramacaoFiltersDto } from './dto/programacao-filters.dto';
import {
  AnalisarProgramacaoDto,
  AprovarProgramacaoDto,
  RejeitarProgramacaoDto,
  CancelarProgramacaoDto,
  CreateProgramacaoAnomaliaDto,
  CreateProgramacaoTarefasDto,
  AdicionarTarefasDto,
  AtualizarTarefasDto,
} from './dto/programacao-actions.dto';
import { CondicaoOS, TipoOS, PrioridadeOS, OrigemOS, StatusProgramacaoOS } from '@prisma/client';

describe('ProgramacaoOSController', () => {
  let controller: ProgramacaoOSController;
  let service: ProgramacaoOSService;

  const mockProgramacaoResponse = {
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
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  const mockListResponse = {
    data: [mockProgramacaoResponse],
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    },
    stats: {
      rascunho: 0,
      pendentes: 1,
      em_analise: 0,
      aprovadas: 0,
      rejeitadas: 0,
      canceladas: 0,
    },
  };

  const mockProgramacaoDetalhes = {
    ...mockProgramacaoResponse,
    materiais: [],
    ferramentas: [],
    tecnicos: [],
    historico: [],
  };

  const mockProgramacaoOSService = {
    listar: jest.fn(),
    buscarPorId: jest.fn(),
    criar: jest.fn(),
    atualizar: jest.fn(),
    analisar: jest.fn(),
    aprovar: jest.fn(),
    rejeitar: jest.fn(),
    cancelar: jest.fn(),
    criarDeAnomalia: jest.fn(),
    criarDeTarefas: jest.fn(),
    adicionarTarefasProgramacao: jest.fn(),
    atualizarTarefasProgramacao: jest.fn(),
    removerTarefaProgramacao: jest.fn(),
    deletar: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProgramacaoOSController],
      providers: [
        {
          provide: ProgramacaoOSService,
          useValue: mockProgramacaoOSService,
        },
      ],
    }).compile();

    controller = module.get<ProgramacaoOSController>(ProgramacaoOSController);
    service = module.get<ProgramacaoOSService>(ProgramacaoOSService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('listar', () => {
    it('deve listar programações com filtros', async () => {
      const filters: ProgramacaoFiltersDto = {
        page: 1,
        limit: 10,
        search: 'motor',
      };

      mockProgramacaoOSService.listar.mockResolvedValue(mockListResponse);

      const result = await controller.listar(filters);

      expect(service.listar).toHaveBeenCalledWith(filters);
      expect(result).toEqual(mockListResponse);
    });

    it('deve listar programações sem filtros', async () => {
      const filters: ProgramacaoFiltersDto = {};
      mockProgramacaoOSService.listar.mockResolvedValue(mockListResponse);

      const result = await controller.listar(filters);

      expect(service.listar).toHaveBeenCalledWith(filters);
      expect(result).toEqual(mockListResponse);
    });
  });

  describe('buscarPorId', () => {
    it('deve retornar uma programação por ID', async () => {
      const id = 'clrx1234567890123456789012';
      mockProgramacaoOSService.buscarPorId.mockResolvedValue(mockProgramacaoDetalhes);

      const result = await controller.buscarPorId(id);

      expect(service.buscarPorId).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockProgramacaoDetalhes);
    });
  });

  describe('criar', () => {
    it('deve criar uma nova programação', async () => {
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

      mockProgramacaoOSService.criar.mockResolvedValue(mockProgramacaoResponse);

      const result = await controller.criar(createDto);

      expect(service.criar).toHaveBeenCalledWith(createDto, undefined);
      expect(result).toEqual(mockProgramacaoResponse);
    });

    it('deve criar programação com materiais, ferramentas e técnicos', async () => {
      const createDto: CreateProgramacaoDto = {
        descricao: 'Manutenção preventiva completa',
        local: 'Planta A',
        ativo: 'Motor 001',
        condicoes: CondicaoOS.FUNCIONANDO,
        tipo: TipoOS.PREVENTIVA,
        prioridade: PrioridadeOS.ALTA,
        origem: OrigemOS.PLANO_MANUTENCAO,
        tempo_estimado: 8.0,
        duracao_estimada: 10.0,
        materiais: [
          {
            descricao: 'Óleo lubrificante',
            quantidade_planejada: 5.5,
            unidade: 'L',
            custo_unitario: 15.50,
          },
        ],
        ferramentas: [
          {
            descricao: 'Chave inglesa 1/2"',
            quantidade: 1,
          },
        ],
        tecnicos: [
          {
            nome: 'João Silva',
            especialidade: 'Mecânico',
            horas_estimadas: 8.0,
            custo_hora: 50.00,
          },
        ],
      };

      mockProgramacaoOSService.criar.mockResolvedValue(mockProgramacaoResponse);

      const result = await controller.criar(createDto);

      expect(service.criar).toHaveBeenCalledWith(createDto, undefined);
      expect(result).toEqual(mockProgramacaoResponse);
    });
  });

  describe('atualizar', () => {
    it('deve atualizar uma programação', async () => {
      const id = 'clrx1234567890123456789012';
      const updateDto: UpdateProgramacaoDto = {
        descricao: 'Manutenção preventiva atualizada',
        tempo_estimado: 5.0,
      };

      mockProgramacaoOSService.atualizar.mockResolvedValue({
        ...mockProgramacaoResponse,
        ...updateDto,
      });

      const result = await controller.atualizar(id, updateDto);

      expect(service.atualizar).toHaveBeenCalledWith(id, updateDto, undefined);
      expect(result.descricao).toBe(updateDto.descricao);
      expect(result.tempo_estimado).toBe(updateDto.tempo_estimado);
    });
  });

  describe('analisar', () => {
    it('deve iniciar análise da programação', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: AnalisarProgramacaoDto = {
        observacoes_analise: 'Iniciando análise técnica',
      };

      mockProgramacaoOSService.analisar.mockResolvedValue(undefined);

      const result = await controller.analisar(id, dto);

      expect(service.analisar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Análise iniciada com sucesso' });
    });
  });

  describe('aprovar', () => {
    it('deve aprovar uma programação', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: AprovarProgramacaoDto = {
        observacoes_aprovacao: 'Aprovado para execução',
        ajustes_orcamento: 1500.00,
      };

      mockProgramacaoOSService.aprovar.mockResolvedValue(undefined);

      const result = await controller.aprovar(id, dto);

      expect(service.aprovar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Programação aprovada e OS gerada com sucesso' });
    });
  });

  describe('rejeitar', () => {
    it('deve rejeitar uma programação', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: RejeitarProgramacaoDto = {
        motivo_rejeicao: 'Dados insuficientes',
        sugestoes_melhoria: 'Adicionar mais detalhes técnicos',
      };

      mockProgramacaoOSService.rejeitar.mockResolvedValue(undefined);

      const result = await controller.rejeitar(id, dto);

      expect(service.rejeitar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Programação rejeitada' });
    });
  });

  describe('cancelar', () => {
    it('deve cancelar uma programação', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: CancelarProgramacaoDto = {
        motivo_cancelamento: 'Equipamento não disponível',
      };

      mockProgramacaoOSService.cancelar.mockResolvedValue(undefined);

      const result = await controller.cancelar(id, dto);

      expect(service.cancelar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Programação cancelada' });
    });
  });

  describe('criarDeAnomalia', () => {
    it('deve criar programação a partir de anomalia', async () => {
      const anomaliaId = 'clrx1234567890123456789012';
      const dto: CreateProgramacaoAnomaliaDto = {
        ajustes: {
          descricao: 'Correção urgente',
          prioridade: 'ALTA',
          tempo_estimado: 3.0,
        },
      };

      mockProgramacaoOSService.criarDeAnomalia.mockResolvedValue(mockProgramacaoResponse);

      const result = await controller.criarDeAnomalia(anomaliaId, dto);

      expect(service.criarDeAnomalia).toHaveBeenCalledWith(anomaliaId, dto, undefined);
      expect(result).toEqual(mockProgramacaoResponse);
    });
  });

  describe('criarDeTarefas', () => {
    it('deve criar programação de múltiplas tarefas', async () => {
      const dto: CreateProgramacaoTarefasDto = {
        tarefas_ids: [
          'clrx1234567890123456789012',
          'clrx9876543210987654321098',
        ],
        descricao: 'Manutenção preventiva agrupada',
        prioridade: 'MEDIA',
        agrupar_por: 'equipamento',
      };

      mockProgramacaoOSService.criarDeTarefas.mockResolvedValue(mockProgramacaoResponse);

      const result = await controller.criarDeTarefas(dto);

      expect(service.criarDeTarefas).toHaveBeenCalledWith(dto, undefined);
      expect(result).toEqual(mockProgramacaoResponse);
    });
  });

  describe('adicionarTarefas', () => {
    it('deve adicionar tarefas à programação', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: AdicionarTarefasDto = {
        tarefas_ids: ['clrx9876543210987654321098'],
        observacoes: 'Tarefas adicionais necessárias',
      };

      mockProgramacaoOSService.adicionarTarefasProgramacao.mockResolvedValue(undefined);

      const result = await controller.adicionarTarefas(id, dto);

      expect(service.adicionarTarefasProgramacao).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Tarefas adicionadas com sucesso' });
    });
  });

  describe('atualizarTarefas', () => {
    it('deve atualizar tarefas da programação', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: AtualizarTarefasDto = {
        tarefas: [
          {
            tarefa_id: 'clrx1234567890123456789012',
            ordem: 1,
            status: 'PENDENTE',
            observacoes: 'Tarefa prioritária',
          },
        ],
      };

      mockProgramacaoOSService.atualizarTarefasProgramacao.mockResolvedValue(undefined);

      const result = await controller.atualizarTarefas(id, dto);

      expect(service.atualizarTarefasProgramacao).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Tarefas atualizadas com sucesso' });
    });
  });

  describe('removerTarefa', () => {
    it('deve remover uma tarefa da programação', async () => {
      const id = 'clrx1234567890123456789012';
      const tarefaId = 'clrx9876543210987654321098';

      mockProgramacaoOSService.removerTarefaProgramacao.mockResolvedValue(undefined);

      const result = await controller.removerTarefa(id, tarefaId);

      expect(service.removerTarefaProgramacao).toHaveBeenCalledWith(id, tarefaId, undefined);
      expect(result).toEqual({ message: 'Tarefa removida com sucesso' });
    });
  });

  describe('deletar', () => {
    it('deve deletar uma programação', async () => {
      const id = 'clrx1234567890123456789012';

      mockProgramacaoOSService.deletar.mockResolvedValue(undefined);

      const result = await controller.deletar(id);

      expect(service.deletar).toHaveBeenCalledWith(id, undefined);
      expect(result).toEqual({ message: 'Programação deletada com sucesso' });
    });
  });
});
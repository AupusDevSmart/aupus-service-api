import { Test, TestingModule } from '@nestjs/testing';
import { ExecucaoOSController } from './execucao-os.controller';
import { ExecucaoOSService } from './execucao-os.service';
import { AnexosOSService } from './anexos-os.service';
import { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { StatusOS, TipoOS, PrioridadeOS, OrigemOS, CondicaoOS, TipoAnexoOS } from '@prisma/client';
import {
  OSFiltersDto,
  ProgramarOSDto,
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
  AdicionarAnexoDto,
} from './dto';
import * as fs from 'fs';

describe('ExecucaoOSController', () => {
  let controller: ExecucaoOSController;
  let execucaoService: ExecucaoOSService;
  let anexosService: AnexosOSService;

  const mockOSResponse = {
    id: 'clrx1234567890123456789012',
    numero_os: 'OS-2025-001',
    descricao: 'Manutenção preventiva do motor',
    local: 'Planta A',
    ativo: 'Motor 001',
    condicoes: CondicaoOS.FUNCIONANDO,
    status: StatusOS.PROGRAMADA,
    tipo: TipoOS.PREVENTIVA,
    prioridade: PrioridadeOS.MEDIA,
    origem: OrigemOS.PLANO_MANUTENCAO,
    data_hora_programada: '2025-02-15T08:00:00Z',
    responsavel: 'João Silva',
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  const mockOSDetalhes = {
    ...mockOSResponse,
    materiais: [],
    ferramentas: [],
    tecnicos: [],
    checklist: [],
    anexos: [],
    registros_tempo: [],
    historico: [],
    programacao_origem: null,
  };

  const mockListResponse = {
    data: [mockOSResponse],
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    },
    stats: {
      planejadas: 0,
      programadas: 1,
      em_execucao: 0,
      pausadas: 0,
      finalizadas: 0,
      canceladas: 0,
    },
  };

  const mockAnexoResponse = {
    id: 'clrx1234567890123456789012',
    os_id: 'clrx1234567890123456789012',
    nome: 'foto_motor.jpg',
    nome_original: 'motor_foto.jpg',
    tipo: TipoAnexoOS.FOTO_ANTES,
    mime_type: 'image/jpeg',
    tamanho: 1024000,
    caminho_s3: '/uploads/anexos-os/foto_motor.jpg',
    url_download: '/anexos-os/foto_motor.jpg',
    uploaded_at: new Date().toISOString(),
  };

  const mockExecucaoOSService = {
    listar: jest.fn(),
    buscarPorId: jest.fn(),
    programar: jest.fn(),
    iniciar: jest.fn(),
    pausar: jest.fn(),
    retomar: jest.fn(),
    atualizarChecklist: jest.fn(),
    registrarMateriais: jest.fn(),
    registrarFerramentas: jest.fn(),
    concluirTarefa: jest.fn(),
    cancelarTarefa: jest.fn(),
    finalizar: jest.fn(),
    cancelar: jest.fn(),
  };

  const mockAnexosOSService = {
    uploadAnexo: jest.fn(),
    listarAnexosOS: jest.fn(),
    buscarAnexo: jest.fn(),
    removerAnexo: jest.fn(),
    obterCaminhoArquivo: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExecucaoOSController],
      providers: [
        {
          provide: ExecucaoOSService,
          useValue: mockExecucaoOSService,
        },
        {
          provide: AnexosOSService,
          useValue: mockAnexosOSService,
        },
      ],
    }).compile();

    controller = module.get<ExecucaoOSController>(ExecucaoOSController);
    execucaoService = module.get<ExecucaoOSService>(ExecucaoOSService);
    anexosService = module.get<AnexosOSService>(AnexosOSService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('listar', () => {
    it('deve listar OS com filtros', async () => {
      const filters: OSFiltersDto = {
        page: 1,
        limit: 10,
        search: 'motor',
        status: StatusOS.PROGRAMADA,
      };

      mockExecucaoOSService.listar.mockResolvedValue(mockListResponse);

      const result = await controller.listar(filters);

      expect(execucaoService.listar).toHaveBeenCalledWith(filters);
      expect(result).toEqual(mockListResponse);
    });

    it('deve listar OS atrasadas', async () => {
      const filters: OSFiltersDto = {
        atrasadas: true,
      };

      mockExecucaoOSService.listar.mockResolvedValue(mockListResponse);

      const result = await controller.listar(filters);

      expect(execucaoService.listar).toHaveBeenCalledWith(filters);
      expect(result).toEqual(mockListResponse);
    });
  });

  describe('buscarPorId', () => {
    it('deve retornar uma OS por ID', async () => {
      const id = 'clrx1234567890123456789012';
      mockExecucaoOSService.buscarPorId.mockResolvedValue(mockOSDetalhes);

      const result = await controller.buscarPorId(id);

      expect(execucaoService.buscarPorId).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockOSDetalhes);
    });
  });

  describe('programar', () => {
    it('deve programar uma OS', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: ProgramarOSDto = {
        data_hora_programada: '2025-02-15T08:00:00Z',
        responsavel: 'João Silva',
        materiais_confirmados: [],
        ferramentas_confirmadas: [],
        tecnicos_confirmados: [],
      };

      mockExecucaoOSService.programar.mockResolvedValue(undefined);

      const result = await controller.programar(id, dto);

      expect(execucaoService.programar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'OS programada com sucesso' });
    });

    it('deve programar OS com reserva de veículo', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: ProgramarOSDto = {
        data_hora_programada: '2025-02-15T08:00:00Z',
        responsavel: 'João Silva',
        materiais_confirmados: [],
        ferramentas_confirmadas: [],
        tecnicos_confirmados: [],
        reserva_veiculo: {
          veiculo_id: 'clrx9876543210987654321098',
          data_inicio: '2025-02-15',
          data_fim: '2025-02-15',
          hora_inicio: '08:00',
          hora_fim: '17:00',
          finalidade: 'Transporte da equipe',
          km_inicial: 50000,
        },
      };

      mockExecucaoOSService.programar.mockResolvedValue(undefined);

      const result = await controller.programar(id, dto);

      expect(execucaoService.programar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'OS programada com sucesso' });
    });
  });

  describe('iniciar', () => {
    it('deve iniciar execução da OS', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: IniciarExecucaoDto = {
        equipe_presente: ['João Silva', 'Maria Santos'],
        responsavel_execucao: 'João Silva',
        observacoes_inicio: 'Início da execução',
      };

      mockExecucaoOSService.iniciar.mockResolvedValue(undefined);

      const result = await controller.iniciar(id, dto);

      expect(execucaoService.iniciar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Execução iniciada com sucesso' });
    });
  });

  describe('pausar', () => {
    it('deve pausar execução da OS', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: PausarExecucaoDto = {
        motivo_pausa: 'Aguardar chegada de peça',
        observacoes: 'Peça em falta no estoque',
      };

      mockExecucaoOSService.pausar.mockResolvedValue(undefined);

      const result = await controller.pausar(id, dto);

      expect(execucaoService.pausar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Execução pausada' });
    });
  });

  describe('retomar', () => {
    it('deve retomar execução da OS', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: RetomarExecucaoDto = {
        observacoes_retomada: 'Peça chegou, retomando execução',
      };

      mockExecucaoOSService.retomar.mockResolvedValue(undefined);

      const result = await controller.retomar(id, dto);

      expect(execucaoService.retomar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Execução retomada' });
    });
  });

  describe('atualizarChecklist', () => {
    it('deve atualizar checklist da OS', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: AtualizarChecklistDto = {
        atividades: [
          {
            id: 'clrx1234567890123456789012',
            concluida: true,
            observacoes: 'Atividade concluída',
          },
        ],
      };

      mockExecucaoOSService.atualizarChecklist.mockResolvedValue(undefined);

      const result = await controller.atualizarChecklist(id, dto);

      expect(execucaoService.atualizarChecklist).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Checklist atualizado com sucesso' });
    });
  });

  describe('registrarMateriais', () => {
    it('deve registrar consumo de materiais', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: RegistrarMateriaisDto = {
        materiais: [
          {
            id: 'clrx1234567890123456789012',
            quantidade_consumida: 5.5,
            observacoes: 'Consumo total',
          },
        ],
      };

      mockExecucaoOSService.registrarMateriais.mockResolvedValue(undefined);

      const result = await controller.registrarMateriais(id, dto);

      expect(execucaoService.registrarMateriais).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Consumo de materiais registrado' });
    });
  });

  describe('registrarFerramentas', () => {
    it('deve registrar uso de ferramentas', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: RegistrarFerramentasDto = {
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

      mockExecucaoOSService.registrarFerramentas.mockResolvedValue(undefined);

      const result = await controller.registrarFerramentas(id, dto);

      expect(execucaoService.registrarFerramentas).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'Uso de ferramentas registrado' });
    });
  });

  describe('listarTarefas', () => {
    it('deve listar tarefas da OS', async () => {
      const id = 'clrx1234567890123456789012';
      const mockTarefas = [
        {
          id: 'clrx1234567890123456789012',
          os_id: id,
          tarefa_id: 'clrx9876543210987654321098',
          ordem: 1,
          status: 'PENDENTE',
          tarefa: {
            id: 'clrx9876543210987654321098',
            nome: 'Troca de óleo',
            categoria: 'Mecânica',
            tipo_manutencao: 'PREVENTIVA',
          },
        },
      ];

      mockExecucaoOSService.buscarPorId.mockResolvedValue({
        ...mockOSDetalhes,
        tarefas_os: mockTarefas,
      });

      const result = await controller.listarTarefas(id);

      expect(execucaoService.buscarPorId).toHaveBeenCalledWith(id);
      expect(result).toEqual({ tarefas: mockTarefas });
    });
  });

  describe('concluirTarefa', () => {
    it('deve concluir uma tarefa da OS', async () => {
      const id = 'clrx1234567890123456789012';
      const tarefaId = 'clrx9876543210987654321098';
      const dto: ConcluirTarefaDto = {
        observacoes: 'Tarefa concluída com sucesso',
        tempo_execucao: 120,
        concluida_por: 'João Silva',
      };

      mockExecucaoOSService.concluirTarefa.mockResolvedValue(undefined);

      const result = await controller.concluirTarefa(id, tarefaId, dto);

      expect(execucaoService.concluirTarefa).toHaveBeenCalledWith(id, tarefaId, dto, undefined);
      expect(result).toEqual({ message: 'Tarefa concluída com sucesso' });
    });
  });

  describe('cancelarTarefa', () => {
    it('deve cancelar uma tarefa da OS', async () => {
      const id = 'clrx1234567890123456789012';
      const tarefaId = 'clrx9876543210987654321098';
      const dto: CancelarTarefaDto = {
        motivo_cancelamento: 'Equipamento com defeito',
        observacoes: 'Necessário reparo antes da execução',
      };

      mockExecucaoOSService.cancelarTarefa.mockResolvedValue(undefined);

      const result = await controller.cancelarTarefa(id, tarefaId, dto);

      expect(execucaoService.cancelarTarefa).toHaveBeenCalledWith(id, tarefaId, dto, undefined);
      expect(result).toEqual({ message: 'Tarefa cancelada' });
    });
  });

  describe('anexos', () => {
    describe('adicionarAnexo', () => {
      it('deve adicionar anexo à OS', async () => {
        const id = 'clrx1234567890123456789012';
        const mockFile = {
          originalname: 'motor_foto.jpg',
          mimetype: 'image/jpeg',
          size: 1024000,
          buffer: Buffer.from('fake file content'),
        };
        const dto: AdicionarAnexoDto = {
          descricao: 'Foto do motor antes da manutenção',
          fase_execucao: 'antes',
        };
        const tipo = TipoAnexoOS.FOTO_ANTES;

        mockAnexosOSService.uploadAnexo.mockResolvedValue(mockAnexoResponse);

        const result = await controller.adicionarAnexo(id, mockFile, dto, tipo);

        expect(anexosService.uploadAnexo).toHaveBeenCalledWith(
          id,
          mockFile,
          tipo,
          dto.descricao,
          dto.fase_execucao,
          undefined
        );
        expect(result).toEqual(mockAnexoResponse);
      });
    });

    describe('listarAnexos', () => {
      it('deve listar anexos da OS', async () => {
        const id = 'clrx1234567890123456789012';
        const mockAnexos = [mockAnexoResponse];

        mockAnexosOSService.listarAnexosOS.mockResolvedValue(mockAnexos);

        const result = await controller.listarAnexos(id);

        expect(anexosService.listarAnexosOS).toHaveBeenCalledWith(id);
        expect(result).toEqual(mockAnexos);
      });
    });

    describe('obterAnexo', () => {
      it('deve obter anexo específico', async () => {
        const id = 'clrx1234567890123456789012';
        const anexoId = 'clrx9876543210987654321098';

        mockAnexosOSService.buscarAnexo.mockResolvedValue(mockAnexoResponse);

        const result = await controller.obterAnexo(id, anexoId);

        expect(anexosService.buscarAnexo).toHaveBeenCalledWith(anexoId);
        expect(result).toEqual(mockAnexoResponse);
      });
    });

    describe('downloadAnexo', () => {
      it('deve fazer download do anexo', async () => {
        const id = 'clrx1234567890123456789012';
        const anexoId = 'clrx9876543210987654321098';
        const caminhoArquivo = '/uploads/anexos-os/foto_motor.jpg';

        const mockResponse = {
          set: jest.fn(),
        } as unknown as Response;

        // Mock do fs.createReadStream
        const mockFileStream = {} as any;
        jest.spyOn(fs, 'createReadStream').mockReturnValue(mockFileStream);

        mockAnexosOSService.buscarAnexo.mockResolvedValue(mockAnexoResponse);
        mockAnexosOSService.obterCaminhoArquivo.mockResolvedValue(caminhoArquivo);

        const result = await controller.downloadAnexo(id, anexoId, mockResponse);

        expect(anexosService.buscarAnexo).toHaveBeenCalledWith(anexoId);
        expect(anexosService.obterCaminhoArquivo).toHaveBeenCalledWith(anexoId);
        expect(mockResponse.set).toHaveBeenCalledWith({
          'Content-Type': mockAnexoResponse.mime_type,
          'Content-Disposition': `attachment; filename="${mockAnexoResponse.nome_original}"`,
        });
        expect(result).toBeInstanceOf(StreamableFile);
      });
    });

    describe('removerAnexo', () => {
      it('deve remover anexo', async () => {
        const id = 'clrx1234567890123456789012';
        const anexoId = 'clrx9876543210987654321098';

        mockAnexosOSService.removerAnexo.mockResolvedValue(undefined);

        const result = await controller.removerAnexo(id, anexoId);

        expect(anexosService.removerAnexo).toHaveBeenCalledWith(anexoId, undefined);
        expect(result).toEqual({ message: 'Anexo removido com sucesso' });
      });
    });
  });

  describe('finalizar', () => {
    it('deve finalizar OS', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: FinalizarOSDto = {
        resultado_servico: 'Manutenção concluída com sucesso',
        materiais_consumidos: [
          {
            id: 'clrx1234567890123456789012',
            quantidade_consumida: 5.0,
            observacoes: 'Consumo total',
          },
        ],
        ferramentas_utilizadas: [
          {
            id: 'clrx9876543210987654321098',
            condicao_depois: 'Boa',
            observacoes: 'Ferramenta em bom estado',
          },
        ],
        avaliacao_qualidade: 5,
        observacoes_qualidade: 'Serviço executado perfeitamente',
      };

      mockExecucaoOSService.finalizar.mockResolvedValue(undefined);

      const result = await controller.finalizar(id, dto);

      expect(execucaoService.finalizar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'OS finalizada com sucesso' });
    });
  });

  describe('cancelar', () => {
    it('deve cancelar OS', async () => {
      const id = 'clrx1234567890123456789012';
      const dto: CancelarOSDto = {
        motivo_cancelamento: 'Equipamento com defeito grave',
        observacoes: 'Necessário reparo especializado',
      };

      mockExecucaoOSService.cancelar.mockResolvedValue(undefined);

      const result = await controller.cancelar(id, dto);

      expect(execucaoService.cancelar).toHaveBeenCalledWith(id, dto, undefined);
      expect(result).toEqual({ message: 'OS cancelada' });
    });
  });

  describe('gerarRelatorio', () => {
    it('deve gerar relatório de execução', async () => {
      const id = 'clrx1234567890123456789012';

      mockExecucaoOSService.buscarPorId.mockResolvedValue(mockOSDetalhes);

      const result = await controller.gerarRelatorio(id);

      expect(execucaoService.buscarPorId).toHaveBeenCalledWith(id);
      expect(result).toEqual({
        message: 'Relatório em desenvolvimento',
        os_id: id,
      });
    });
  });
});
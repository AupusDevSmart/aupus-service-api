import { Test, TestingModule } from '@nestjs/testing';
import { AnexosOSService } from './anexos-os.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TipoAnexoOS } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Mock do módulo fs
jest.mock('fs');

describe('AnexosOSService', () => {
  let service: AnexosOSService;
  let prisma: PrismaService;

  const mockFsModule = fs as jest.Mocked<typeof fs>;

  const mockOSData = {
    id: 'clrx1234567890123456789012',
    numero_os: 'OS-2025-001',
    deletado_em: null,
  };

  const mockAnexoData = {
    id: 'clrx1234567890123456789012',
    os_id: 'clrx1234567890123456789012',
    nome: 'motor_foto_123456_abc123.jpg',
    nome_original: 'motor_foto.jpg',
    tipo: TipoAnexoOS.FOTO_ANTES,
    mime_type: 'image/jpeg',
    tamanho: 1024000,
    descricao: 'Foto do motor antes da manutenção',
    caminho_s3: '/uploads/anexos-os/motor_foto_123456_abc123.jpg',
    url_download: '/anexos-os/motor_foto_123456_abc123.jpg',
    fase_execucao: 'antes',
    uploaded_at: new Date(),
    uploaded_by: 'João Silva',
    uploaded_by_id: 'user123',
    deletado_em: null,
  };

  const mockFile = {
    originalname: 'motor_foto.jpg',
    mimetype: 'image/jpeg',
    size: 1024000,
    buffer: Buffer.from('fake file content'),
  };

  const mockPrismaService = {
    ordens_servico: {
      findFirst: jest.fn(),
    },
    anexos_os: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnexosOSService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AnexosOSService>(AnexosOSService);
    prisma = module.get<PrismaService>(PrismaService);

    // Reset dos mocks
    jest.clearAllMocks();

    // Mock padrão para fs.existsSync
    mockFsModule.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('uploadAnexo', () => {
    it('deve fazer upload de anexo com sucesso', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.anexos_os.create.mockResolvedValue(mockAnexoData);

      // Mock do fs
      mockFsModule.existsSync.mockReturnValue(true);
      mockFsModule.mkdirSync.mockReturnValue(undefined);
      mockFsModule.writeFileSync.mockReturnValue(undefined);

      const result = await service.uploadAnexo(
        'clrx1234567890123456789012',
        mockFile,
        TipoAnexoOS.FOTO_ANTES,
        'Foto do motor antes da manutenção',
        'antes',
        'user123'
      );

      expect(mockPrismaService.ordens_servico.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clrx1234567890123456789012',
          deletado_em: null,
        },
      });

      expect(mockPrismaService.anexos_os.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nome: expect.stringMatching(/^motor_foto_\d+_[a-z0-9]+\.jpg$/),
          nome_original: 'motor_foto.jpg',
          tipo: TipoAnexoOS.FOTO_ANTES,
          mime_type: 'image/jpeg',
          tamanho: 1024000,
          descricao: 'Foto do motor antes da manutenção',
          fase_execucao: 'antes',
          uploaded_by_id: 'user123',
        }),
      });

      expect(result).toEqual(expect.objectContaining({
        id: mockAnexoData.id,
        nome: mockAnexoData.nome,
        tipo: TipoAnexoOS.FOTO_ANTES,
      }));
    });

    it('deve criar diretório se não existir', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.anexos_os.create.mockResolvedValue(mockAnexoData);

      // Mock para simular que diretório não existe
      mockFsModule.existsSync.mockReturnValueOnce(false); // Para o diretório
      mockFsModule.mkdirSync.mockReturnValue(undefined);
      mockFsModule.writeFileSync.mockReturnValue(undefined);

      await service.uploadAnexo(
        'clrx1234567890123456789012',
        mockFile,
        TipoAnexoOS.FOTO_ANTES,
        'Foto do motor',
        'antes',
        'user123'
      );

      expect(mockFsModule.mkdirSync).toHaveBeenCalledWith(
        expect.stringMatching(/uploads[\\\/]anexos-os$/),
        { recursive: true }
      );

      expect(mockFsModule.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        mockFile.buffer
      );
    });

    it('deve lançar NotFoundException quando OS não encontrada', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(null);

      await expect(service.uploadAnexo(
        'clrx1234567890123456789012',
        mockFile,
        TipoAnexoOS.FOTO_ANTES
      )).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando arquivo não fornecido', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);

      await expect(service.uploadAnexo(
        'clrx1234567890123456789012',
        null,
        TipoAnexoOS.FOTO_ANTES
      )).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException para tipo de arquivo não permitido', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);

      const arquivoInvalido = {
        ...mockFile,
        originalname: 'arquivo.txt',
        mimetype: 'text/plain',
      };

      await expect(service.uploadAnexo(
        'clrx1234567890123456789012',
        arquivoInvalido,
        TipoAnexoOS.DOCUMENTO
      )).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException para arquivo muito grande', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);

      const arquivoGrande = {
        ...mockFile,
        size: 15 * 1024 * 1024, // 15MB > 10MB limite
      };

      await expect(service.uploadAnexo(
        'clrx1234567890123456789012',
        arquivoGrande,
        TipoAnexoOS.FOTO_ANTES
      )).rejects.toThrow(BadRequestException);
    });

    it('deve aceitar todos os tipos de arquivo permitidos', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.anexos_os.create.mockResolvedValue(mockAnexoData);
      mockFsModule.existsSync.mockReturnValue(true);
      mockFsModule.mkdirSync.mockReturnValue(undefined);
      mockFsModule.writeFileSync.mockReturnValue(undefined);

      const tiposPermitidos = ['png', 'pdf', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'];

      for (const tipo of tiposPermitidos) {
        const arquivo = {
          ...mockFile,
          originalname: `arquivo.${tipo}`,
          mimetype: `application/${tipo}`,
        };

        await expect(service.uploadAnexo(
          'clrx1234567890123456789012',
          arquivo,
          TipoAnexoOS.DOCUMENTO
        )).resolves.not.toThrow();
      }
    });
  });

  describe('listarAnexosOS', () => {
    it('deve listar anexos da OS', async () => {
      const mockAnexos = [mockAnexoData];

      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
      mockPrismaService.anexos_os.findMany.mockResolvedValue(mockAnexos);

      const result = await service.listarAnexosOS('clrx1234567890123456789012');

      expect(mockPrismaService.anexos_os.findMany).toHaveBeenCalledWith({
        where: {
          os_id: 'clrx1234567890123456789012',
          deletado_em: null,
        },
        orderBy: { uploaded_at: 'desc' },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        id: mockAnexoData.id,
        nome: mockAnexoData.nome,
        tipo: mockAnexoData.tipo,
      }));
    });

    it('deve lançar NotFoundException quando OS não encontrada', async () => {
      mockPrismaService.ordens_servico.findFirst.mockResolvedValue(null);

      await expect(service.listarAnexosOS('clrx1234567890123456789012'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('buscarAnexo', () => {
    it('deve retornar anexo por ID', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(mockAnexoData);

      const result = await service.buscarAnexo('clrx1234567890123456789012');

      expect(mockPrismaService.anexos_os.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clrx1234567890123456789012',
          deletado_em: null,
        },
      });

      expect(result).toEqual(expect.objectContaining({
        id: mockAnexoData.id,
        nome: mockAnexoData.nome,
        tipo: mockAnexoData.tipo,
      }));
    });

    it('deve lançar NotFoundException quando anexo não encontrado', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(null);

      await expect(service.buscarAnexo('clrx1234567890123456789012'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('removerAnexo', () => {
    it('deve remover anexo (soft delete) e arquivo físico', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(mockAnexoData);
      mockPrismaService.anexos_os.update.mockResolvedValue({});

      // Mock para fs.existsSync e fs.unlinkSync
      mockFsModule.existsSync.mockReturnValue(true);
      mockFsModule.unlinkSync.mockReturnValue(undefined);

      // Mock do console.error para evitar logs durante o teste
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await service.removerAnexo('clrx1234567890123456789012', 'user123');

      expect(mockPrismaService.anexos_os.update).toHaveBeenCalledWith({
        where: { id: 'clrx1234567890123456789012' },
        data: { deletado_em: expect.any(Date) },
      });

      expect(mockFsModule.unlinkSync).toHaveBeenCalledWith(mockAnexoData.caminho_s3);

      consoleSpy.mockRestore();
    });

    it('deve lidar com erro ao remover arquivo físico', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(mockAnexoData);
      mockPrismaService.anexos_os.update.mockResolvedValue({});

      // Mock para simular erro ao remover arquivo
      mockFsModule.existsSync.mockReturnValue(true);
      mockFsModule.unlinkSync.mockImplementation(() => {
        throw new Error('Erro ao remover arquivo');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Não deve lançar erro, apenas logar
      await expect(service.removerAnexo('clrx1234567890123456789012', 'user123'))
        .resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Erro ao remover arquivo físico:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('deve continuar se arquivo físico não existir', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(mockAnexoData);
      mockPrismaService.anexos_os.update.mockResolvedValue({});

      // Mock para simular que arquivo não existe
      mockFsModule.existsSync.mockReturnValue(false);

      await expect(service.removerAnexo('clrx1234567890123456789012', 'user123'))
        .resolves.not.toThrow();

      expect(mockFsModule.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('obterCaminhoArquivo', () => {
    it('deve retornar caminho do arquivo quando existe', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(mockAnexoData);
      mockFsModule.existsSync.mockReturnValue(true);

      const result = await service.obterCaminhoArquivo('clrx1234567890123456789012');

      expect(result).toBe(mockAnexoData.caminho_s3);
      expect(mockFsModule.existsSync).toHaveBeenCalledWith(mockAnexoData.caminho_s3);
    });

    it('deve lançar NotFoundException quando arquivo não existe no filesystem', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(mockAnexoData);
      mockFsModule.existsSync.mockReturnValue(false);

      await expect(service.obterCaminhoArquivo('clrx1234567890123456789012'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('métodos auxiliares', () => {
    describe('extrairExtensao', () => {
      it('deve extrair extensão corretamente', async () => {
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
        mockPrismaService.anexos_os.create.mockResolvedValue(mockAnexoData);
        mockFsModule.existsSync.mockReturnValue(true);
        mockFsModule.mkdirSync.mockReturnValue(undefined);
        mockFsModule.writeFileSync.mockReturnValue(undefined);

        // Teste com diferentes extensões
        const arquivos = [
          { nome: 'teste.JPG', extensaoEsperada: 'jpg' },
          { nome: 'documento.PDF', extensaoEsperada: 'pdf' },
          { nome: 'planilha.XLSX', extensaoEsperada: 'xlsx' },
        ];

        for (const arquivo of arquivos) {
          const mockArquivo = {
            ...mockFile,
            originalname: arquivo.nome,
          };

          // A validação interna deve aceitar a extensão
          await expect(service.uploadAnexo(
            'clrx1234567890123456789012',
            mockArquivo,
            TipoAnexoOS.DOCUMENTO
          )).resolves.not.toThrow();
        }
      });
    });

    describe('gerarNomeUnico', () => {
      it('deve gerar nomes únicos para arquivos iguais', async () => {
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
        mockFsModule.existsSync.mockReturnValue(true);
        mockFsModule.mkdirSync.mockReturnValue(undefined);
        mockFsModule.writeFileSync.mockReturnValue(undefined);

        const nomesCriados: string[] = [];

        // Mock para capturar nomes gerados
        mockPrismaService.anexos_os.create.mockImplementation((params) => {
          nomesCriados.push(params.data.nome);
          return Promise.resolve({ ...mockAnexoData, nome: params.data.nome });
        });

        // Fazer upload do mesmo arquivo múltiplas vezes
        for (let i = 0; i < 3; i++) {
          await service.uploadAnexo(
            'clrx1234567890123456789012',
            mockFile,
            TipoAnexoOS.FOTO_ANTES
          );
        }

        // Todos os nomes devem ser únicos
        expect(nomesCriados).toHaveLength(3);
        expect(new Set(nomesCriados).size).toBe(3);

        // Todos devem seguir o padrão: nome_timestamp_random.extensao
        nomesCriados.forEach(nome => {
          expect(nome).toMatch(/^motor_foto_\d+_[a-z0-9]+\.jpg$/);
        });
      });
    });

    describe('validarArquivo', () => {
      const tiposPermitidos = ['png', 'pdf', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'];
      const tiposNaoPermitidos = ['txt', 'exe', 'bat', 'sh', 'zip'];

      it('deve aceitar tipos permitidos', async () => {
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
        mockPrismaService.anexos_os.create.mockResolvedValue(mockAnexoData);
        mockFsModule.existsSync.mockReturnValue(true);
        mockFsModule.mkdirSync.mockReturnValue(undefined);
        mockFsModule.writeFileSync.mockReturnValue(undefined);

        for (const tipo of tiposPermitidos) {
          const arquivo = {
            ...mockFile,
            originalname: `arquivo.${tipo}`,
          };

          await expect(service.uploadAnexo(
            'clrx1234567890123456789012',
            arquivo,
            TipoAnexoOS.DOCUMENTO
          )).resolves.not.toThrow();
        }
      });

      it('deve rejeitar tipos não permitidos', async () => {
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);

        for (const tipo of tiposNaoPermitidos) {
          const arquivo = {
            ...mockFile,
            originalname: `arquivo.${tipo}`,
          };

          await expect(service.uploadAnexo(
            'clrx1234567890123456789012',
            arquivo,
            TipoAnexoOS.DOCUMENTO
          )).rejects.toThrow(BadRequestException);
        }
      });

      it('deve rejeitar arquivos acima do limite de tamanho', async () => {
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);

        const arquivoGrande = {
          ...mockFile,
          size: 11 * 1024 * 1024, // 11MB > 10MB limite
        };

        await expect(service.uploadAnexo(
          'clrx1234567890123456789012',
          arquivoGrande,
          TipoAnexoOS.FOTO_ANTES
        )).rejects.toThrow(BadRequestException);
      });

      it('deve aceitar arquivos no limite de tamanho', async () => {
        mockPrismaService.ordens_servico.findFirst.mockResolvedValue(mockOSData);
        mockPrismaService.anexos_os.create.mockResolvedValue(mockAnexoData);
        mockFsModule.existsSync.mockReturnValue(true);
        mockFsModule.mkdirSync.mockReturnValue(undefined);
        mockFsModule.writeFileSync.mockReturnValue(undefined);

        const arquivoNoLimite = {
          ...mockFile,
          size: 10 * 1024 * 1024, // Exatamente 10MB
        };

        await expect(service.uploadAnexo(
          'clrx1234567890123456789012',
          arquivoNoLimite,
          TipoAnexoOS.FOTO_ANTES
        )).resolves.not.toThrow();
      });
    });
  });

  describe('mapearParaResponse', () => {
    it('deve mapear dados corretamente', async () => {
      mockPrismaService.anexos_os.findFirst.mockResolvedValue(mockAnexoData);

      const result = await service.buscarAnexo('clrx1234567890123456789012');

      expect(result).toEqual({
        id: mockAnexoData.id,
        os_id: mockAnexoData.os_id,
        nome: mockAnexoData.nome,
        nome_original: mockAnexoData.nome_original,
        tipo: mockAnexoData.tipo,
        mime_type: mockAnexoData.mime_type,
        tamanho: Number(mockAnexoData.tamanho),
        descricao: mockAnexoData.descricao,
        caminho_s3: mockAnexoData.caminho_s3,
        url_download: mockAnexoData.url_download,
        fase_execucao: mockAnexoData.fase_execucao,
        uploaded_at: mockAnexoData.uploaded_at,
        uploaded_by: mockAnexoData.uploaded_by,
        uploaded_by_id: mockAnexoData.uploaded_by_id,
        deletado_em: mockAnexoData.deletado_em,
      });
    });
  });
});
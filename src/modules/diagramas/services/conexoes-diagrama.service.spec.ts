import { Test, TestingModule } from '@nestjs/testing';
import { ConexoesDiagramaService } from './conexoes-diagrama.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

// Enums do DTO
enum PortaEnum {
  TOP = 'top',
  BOTTOM = 'bottom',
  LEFT = 'left',
  RIGHT = 'right',
}

enum TipoLinhaEnum {
  SOLIDA = 'solida',
  TRACEJADA = 'tracejada',
  PONTILHADA = 'pontilhada',
}

describe('ConexoesDiagramaService', () => {
  let service: ConexoesDiagramaService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    diagramas_unitarios: {
      findFirst: jest.fn(),
    },
    equipamentos: {
      findFirst: jest.fn(),
    },
    equipamentos_conexoes: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConexoesDiagramaService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ConexoesDiagramaService>(ConexoesDiagramaService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const mockDiagrama = {
      id: 'diagrama-123',
      nome: 'Diagrama Teste',
      deleted_at: null,
    };

    const mockEquipOrigem = {
      id: 'equip-origem',
      nome: 'Inversor 01',
      diagrama_id: 'diagrama-123',
      deleted_at: null,
    };

    const mockEquipDestino = {
      id: 'equip-destino',
      nome: 'Transformador 01',
      diagrama_id: 'diagrama-123',
      deleted_at: null,
    };

    const createDto = {
      origem: {
        equipamentoId: 'equip-origem',
        porta: PortaEnum.RIGHT,
      },
      destino: {
        equipamentoId: 'equip-destino',
        porta: PortaEnum.LEFT,
      },
      visual: {
        tipoLinha: TipoLinhaEnum.SOLIDA,
        cor: '#22c55e',
        espessura: 2,
      },
      pontosIntermediarios: [
        { x: 164, y: 200 },
        { x: 220, y: 200 },
      ],
      rotulo: '380V',
      ordem: 1,
    };

    it('deve criar conexão entre equipamentos com sucesso', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(
        mockDiagrama,
      );
      mockPrismaService.equipamentos.findFirst
        .mockResolvedValueOnce(mockEquipOrigem)
        .mockResolvedValueOnce(mockEquipDestino);
      mockPrismaService.equipamentos_conexoes.create.mockResolvedValue({
        id: 'conexao-123',
        diagrama_id: 'diagrama-123',
        equipamento_origem_id: 'equip-origem',
        porta_origem: 'right',
        equipamento_destino_id: 'equip-destino',
        porta_destino: 'left',
        tipo_linha: 'solida',
        cor: '#22c55e',
        espessura: 2,
        pontos_intermediarios: [
          { x: 164, y: 200 },
          { x: 220, y: 200 },
        ],
        rotulo: '380V',
        ordem: 1,
        created_at: new Date(),
        updated_at: new Date(),
        equipamento_origem: mockEquipOrigem,
        equipamento_destino: mockEquipDestino,
      });

      const result = await service.create('diagrama-123', createDto);

      expect(prismaService.equipamentos_conexoes.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          diagrama_id: 'diagrama-123',
          equipamento_origem_id: 'equip-origem',
          porta_origem: 'right',
          equipamento_destino_id: 'equip-destino',
          porta_destino: 'left',
          tipo_linha: 'solida',
          cor: '#22c55e',
          espessura: 2,
        }),
        include: expect.any(Object),
      });
      expect(result).toHaveProperty('id', 'conexao-123');
      expect(result.origem).toHaveProperty('equipamentoId', 'equip-origem');
      expect(result.destino).toHaveProperty('equipamentoId', 'equip-destino');
    });

    it('deve lançar NotFoundException se diagrama não existir', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(null);

      await expect(
        service.create('diagrama-inexistente', createDto),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.create('diagrama-inexistente', createDto),
      ).rejects.toThrow('Diagrama não encontrado');
    });

    it('deve lançar BadRequestException se equipamento origem não está no diagrama', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(
        mockDiagrama,
      );
      mockPrismaService.equipamentos.findFirst.mockResolvedValueOnce(null);

      await expect(service.create('diagrama-123', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('diagrama-123', createDto)).rejects.toThrow(
        'Equipamento de origem não encontrado ou não está no diagrama',
      );
    });

    it('deve lançar BadRequestException se equipamento destino não está no diagrama', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(
        mockDiagrama,
      );
      mockPrismaService.equipamentos.findFirst
        .mockResolvedValueOnce(mockEquipOrigem)
        .mockResolvedValueOnce(null);

      await expect(service.create('diagrama-123', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('diagrama-123', createDto)).rejects.toThrow(
        'Equipamento de destino não encontrado ou não está no diagrama',
      );
    });

    it('deve validar portas válidas', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(
        mockDiagrama,
      );
      mockPrismaService.equipamentos.findFirst
        .mockResolvedValueOnce(mockEquipOrigem)
        .mockResolvedValueOnce(mockEquipDestino);

      const dtoComPortaInvalida = {
        ...createDto,
        origem: { equipamentoId: 'equip-origem', porta: 'invalid' },
      };

      await expect(
        service.create('diagrama-123', dtoComPortaInvalida as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('diagrama-123', dtoComPortaInvalida as any),
      ).rejects.toThrow('Porta de origem inválida');
    });

    it('deve validar tipo de linha', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(
        mockDiagrama,
      );
      mockPrismaService.equipamentos.findFirst
        .mockResolvedValueOnce(mockEquipOrigem)
        .mockResolvedValueOnce(mockEquipDestino);

      const dtoComTipoLinhaInvalido = {
        ...createDto,
        visual: { tipoLinha: 'invalido', cor: '#22c55e', espessura: 2 },
      };

      await expect(
        service.create('diagrama-123', dtoComTipoLinhaInvalido as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('diagrama-123', dtoComTipoLinhaInvalido as any),
      ).rejects.toThrow('Tipo de linha inválido');
    });

    it('deve validar espessura entre 1 e 10', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(
        mockDiagrama,
      );
      mockPrismaService.equipamentos.findFirst
        .mockResolvedValueOnce(mockEquipOrigem)
        .mockResolvedValueOnce(mockEquipDestino);

      const dtoComEspessuraInvalida = {
        ...createDto,
        visual: { tipoLinha: TipoLinhaEnum.SOLIDA, cor: '#22c55e', espessura: 15 },
      };

      await expect(
        service.create('diagrama-123', dtoComEspessuraInvalida),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('diagrama-123', dtoComEspessuraInvalida),
      ).rejects.toThrow('Espessura deve estar entre 1 e 10');
    });

    it('deve usar valores padrão se visual não fornecido', async () => {
      mockPrismaService.diagramas_unitarios.findFirst.mockResolvedValue(
        mockDiagrama,
      );
      mockPrismaService.equipamentos.findFirst
        .mockResolvedValueOnce(mockEquipOrigem)
        .mockResolvedValueOnce(mockEquipDestino);
      mockPrismaService.equipamentos_conexoes.create.mockResolvedValue({
        id: 'conexao-123',
        diagrama_id: 'diagrama-123',
        equipamento_origem_id: 'equip-origem',
        porta_origem: 'right',
        equipamento_destino_id: 'equip-destino',
        porta_destino: 'left',
        tipo_linha: 'solida',
        cor: null,
        espessura: 2,
        equipamento_origem: mockEquipOrigem,
        equipamento_destino: mockEquipDestino,
      });

      const dtoSemVisual = {
        origem: createDto.origem,
        destino: createDto.destino,
      };

      await service.create('diagrama-123', dtoSemVisual);

      expect(prismaService.equipamentos_conexoes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo_linha: TipoLinhaEnum.SOLIDA, // Valor padrão
            espessura: 2, // Valor padrão
          }),
        }),
      );
    });
  });

  describe('update', () => {
    const mockConexao = {
      id: 'conexao-123',
      diagrama_id: 'diagrama-123',
      equipamento_origem_id: 'equip-origem',
      porta_origem: 'right',
      equipamento_destino_id: 'equip-destino',
      porta_destino: 'left',
      deleted_at: null,
    };

    const updateDto = {
      visual: {
        tipoLinha: TipoLinhaEnum.TRACEJADA,
        cor: '#3b82f6',
        espessura: 3,
      },
      pontosIntermediarios: [
        { x: 170, y: 205 },
        { x: 170, y: 260 },
      ],
      rotulo: '380V AC',
      ordem: 2,
    };

    it('deve atualizar conexão com sucesso', async () => {
      mockPrismaService.equipamentos_conexoes.findFirst.mockResolvedValue(
        mockConexao,
      );
      mockPrismaService.equipamentos_conexoes.update.mockResolvedValue({
        ...mockConexao,
        tipo_linha: 'tracejada',
        cor: '#3b82f6',
        espessura: 3,
        pontos_intermediarios: updateDto.pontosIntermediarios,
        rotulo: '380V AC',
        ordem: 2,
        equipamento_origem: { id: 'equip-origem', nome: 'Inversor 01', tag: 'INV-01' },
        equipamento_destino: { id: 'equip-destino', nome: 'Transformador 01', tag: 'TRF-01' },
      });

      const result = await service.update(
        'diagrama-123',
        'conexao-123',
        updateDto,
      );

      expect(prismaService.equipamentos_conexoes.update).toHaveBeenCalledWith({
        where: { id: 'conexao-123' },
        data: expect.objectContaining({
          tipo_linha: 'tracejada',
          cor: '#3b82f6',
          espessura: 3,
        }),
        include: expect.any(Object),
      });
      expect(result.visual).toEqual({
        tipoLinha: TipoLinhaEnum.TRACEJADA,
        cor: '#3b82f6',
        espessura: 3,
      });
    });

    it('deve lançar NotFoundException se conexão não existir', async () => {
      mockPrismaService.equipamentos_conexoes.findFirst.mockResolvedValue(null);

      await expect(
        service.update('diagrama-123', 'conexao-inexistente', updateDto),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.update('diagrama-123', 'conexao-inexistente', updateDto),
      ).rejects.toThrow('Conexão não encontrada ou não pertence ao diagrama');
    });

    it('deve validar tipo de linha ao atualizar', async () => {
      mockPrismaService.equipamentos_conexoes.findFirst.mockResolvedValue(
        mockConexao,
      );

      const updateComTipoInvalido = {
        visual: { tipoLinha: 'invalido' },
      };

      await expect(
        service.update('diagrama-123', 'conexao-123', updateComTipoInvalido as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve validar espessura ao atualizar', async () => {
      mockPrismaService.equipamentos_conexoes.findFirst.mockResolvedValue(
        mockConexao,
      );

      const updateComEspessuraInvalida = {
        visual: { espessura: 20 },
      };

      await expect(
        service.update('diagrama-123', 'conexao-123', updateComEspessuraInvalida),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    const mockConexao = {
      id: 'conexao-123',
      diagrama_id: 'diagrama-123',
      deleted_at: null,
    };

    it('deve remover conexão com sucesso (soft delete)', async () => {
      mockPrismaService.equipamentos_conexoes.findFirst.mockResolvedValue(
        mockConexao,
      );
      mockPrismaService.equipamentos_conexoes.update.mockResolvedValue({
        ...mockConexao,
        deleted_at: new Date(),
      });

      const result = await service.remove('diagrama-123', 'conexao-123');

      expect(prismaService.equipamentos_conexoes.update).toHaveBeenCalledWith({
        where: { id: 'conexao-123' },
        data: { deleted_at: expect.any(Date) },
      });
      expect(result).toHaveProperty('id', 'conexao-123');
      expect(result).toHaveProperty('message', 'Conexão removida com sucesso');
    });

    it('deve lançar NotFoundException se conexão não existir', async () => {
      mockPrismaService.equipamentos_conexoes.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('diagrama-123', 'conexao-inexistente'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createBulk', () => {
    const bulkDto = {
      conexoes: [
        {
          origem: { equipamentoId: 'equip-1', porta: PortaEnum.RIGHT },
          destino: { equipamentoId: 'equip-2', porta: PortaEnum.LEFT },
          visual: { tipoLinha: TipoLinhaEnum.SOLIDA, cor: '#22c55e' },
        },
        {
          origem: { equipamentoId: 'equip-2', porta: PortaEnum.RIGHT },
          destino: { equipamentoId: 'equip-3', porta: PortaEnum.LEFT },
          visual: { tipoLinha: TipoLinhaEnum.SOLIDA, cor: '#22c55e' },
        },
        {
          origem: { equipamentoId: 'equip-inexistente', porta: PortaEnum.RIGHT },
          destino: { equipamentoId: 'equip-4', porta: PortaEnum.LEFT },
          visual: { tipoLinha: TipoLinhaEnum.SOLIDA, cor: '#22c55e' },
        },
      ],
    };

    it('deve processar múltiplas conexões e retornar estatísticas', async () => {
      jest
        .spyOn(service, 'create')
        .mockResolvedValueOnce({
          id: 'conexao-1',
          diagramaId: 'diagrama-123',
          origem: { equipamentoId: 'equip-1', porta: PortaEnum.RIGHT },
          destino: { equipamentoId: 'equip-2', porta: PortaEnum.LEFT },
          visual: { tipoLinha: TipoLinhaEnum.SOLIDA, cor: '#22c55e', espessura: 2 },
        } as any)
        .mockResolvedValueOnce({
          id: 'conexao-2',
          diagramaId: 'diagrama-123',
          origem: { equipamentoId: 'equip-2', porta: PortaEnum.RIGHT },
          destino: { equipamentoId: 'equip-3', porta: PortaEnum.LEFT },
          visual: { tipoLinha: TipoLinhaEnum.SOLIDA, cor: '#22c55e', espessura: 2 },
        } as any)
        .mockRejectedValueOnce(
          new BadRequestException('Equipamento de origem não encontrado'),
        );

      const result = await service.createBulk('diagrama-123', bulkDto);

      expect(result.criadas).toBe(2);
      expect(result.erros).toBe(1);
      expect(result.conexoes).toHaveLength(3);
      expect(result.conexoes[0]).toHaveProperty('status', 'created');
      expect(result.conexoes[1]).toHaveProperty('status', 'created');
      expect(result.conexoes[2]).toHaveProperty('status', 'error');
      expect(result.conexoes[2]).toHaveProperty('error');
    });
  });
});

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadAnexoDto {
  descricao?: string;
  tipo_documento?: string;
  uploaded_por_nome: string;
  uploaded_por_id?: string;
}

export interface AnexoResponseDto {
  id: string;
  solicitacao_id: string;
  nome_arquivo: string;
  nome_original: string;
  mime_type: string;
  tamanho: number;
  caminho: string;
  descricao?: string;
  tipo_documento?: string;
  uploaded_por?: string;
  uploaded_at: Date;
}

@Injectable()
export class AnexosSolicitacoesService {
  private readonly logger = new Logger(AnexosSolicitacoesService.name);
  private readonly uploadPath = path.join(
    process.cwd(),
    'uploads',
    'solicitacoes-servico',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly solicitacoesService: SolicitacoesServicoService,
  ) {
    this.ensureUploadDirExists();
  }

  /**
   * Garante que o diretório de upload existe
   */
  private async ensureUploadDirExists(): Promise<void> {
    try {
      await fs.mkdir(this.uploadPath, { recursive: true });
    } catch (error) {
      this.logger.error('Erro ao criar diretório de upload', error);
    }
  }

  /**
   * Valida o tipo de arquivo
   */
  private validateFileType(mimetype: string): boolean {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ];

    return allowedTypes.includes(mimetype);
  }

  /**
   * Upload de anexo
   */
  async uploadAnexo(
    solicitacaoId: string,
    file: Express.Multer.File,
    dto: UploadAnexoDto,
  ): Promise<AnexoResponseDto> {
    // Verificar se a solicitação existe
    await this.solicitacoesService.findOne(solicitacaoId);

    // Validar tipo de arquivo
    if (!this.validateFileType(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não permitido');
    }

    // Validar tamanho (máximo 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('Arquivo muito grande. Máximo permitido: 10MB');
    }

    // Gerar nome único para o arquivo
    const fileExtension = path.extname(file.originalname);
    const uniqueName = `${solicitacaoId}_${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadPath, uniqueName);

    try {
      // Salvar arquivo no disco
      await fs.writeFile(filePath, file.buffer);

      // Salvar informações no banco
      const anexo = await this.prisma.anexos_solicitacao_servico.create({
        data: {
          solicitacao_id: solicitacaoId,
          nome_arquivo: uniqueName,
          nome_original: file.originalname,
          mime_type: file.mimetype,
          tamanho: file.size,
          caminho: filePath,
          descricao: dto.descricao,
          tipo_documento: dto.tipo_documento,
          uploaded_por: dto.uploaded_por_nome,
          uploaded_por_id: dto.uploaded_por_id,
        },
      });

      this.logger.log(
        `Anexo ${file.originalname} salvo para solicitação ${solicitacaoId}`,
      );

      return anexo as AnexoResponseDto;
    } catch (error) {
      // Se houver erro, tentar remover o arquivo
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        this.logger.error('Erro ao remover arquivo após falha', unlinkError);
      }

      throw new BadRequestException('Erro ao salvar anexo');
    }
  }

  /**
   * Listar anexos de uma solicitação
   */
  async listarAnexos(solicitacaoId: string): Promise<AnexoResponseDto[]> {
    // Verificar se a solicitação existe
    await this.solicitacoesService.findOne(solicitacaoId);

    const anexos = await this.prisma.anexos_solicitacao_servico.findMany({
      where: { solicitacao_id: solicitacaoId },
      orderBy: { uploaded_at: 'desc' },
    });

    return anexos as AnexoResponseDto[];
  }

  /**
   * Buscar anexo por ID
   */
  async buscarAnexo(
    solicitacaoId: string,
    anexoId: string,
  ): Promise<AnexoResponseDto> {
    // Verificar se a solicitação existe
    await this.solicitacoesService.findOne(solicitacaoId);

    const anexo = await this.prisma.anexos_solicitacao_servico.findFirst({
      where: {
        id: anexoId,
        solicitacao_id: solicitacaoId,
      },
    });

    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado');
    }

    return anexo as AnexoResponseDto;
  }

  /**
   * Download de anexo
   */
  async downloadAnexo(
    solicitacaoId: string,
    anexoId: string,
  ): Promise<{ buffer: Buffer; anexo: AnexoResponseDto }> {
    const anexo = await this.buscarAnexo(solicitacaoId, anexoId);

    try {
      const buffer = await fs.readFile(anexo.caminho);
      return { buffer, anexo };
    } catch (error) {
      this.logger.error('Erro ao ler arquivo', error);
      throw new NotFoundException('Arquivo não encontrado no servidor');
    }
  }

  /**
   * Remover anexo
   */
  async removerAnexo(
    solicitacaoId: string,
    anexoId: string,
    usuarioId?: string,
  ): Promise<void> {
    const anexo = await this.buscarAnexo(solicitacaoId, anexoId);

    // Remover arquivo do disco
    try {
      await fs.unlink(anexo.caminho);
    } catch (error) {
      this.logger.error('Erro ao remover arquivo do disco', error);
    }

    // Remover do banco
    await this.prisma.anexos_solicitacao_servico.delete({
      where: { id: anexoId },
    });

    this.logger.log(`Anexo ${anexo.nome_original} removido`);
  }

  /**
   * Remover todos os anexos de uma solicitação
   */
  async removerTodosAnexos(solicitacaoId: string): Promise<void> {
    const anexos = await this.listarAnexos(solicitacaoId);

    for (const anexo of anexos) {
      try {
        await fs.unlink(anexo.caminho);
      } catch (error) {
        this.logger.error(
          `Erro ao remover arquivo ${anexo.nome_original}`,
          error,
        );
      }
    }

    await this.prisma.anexos_solicitacao_servico.deleteMany({
      where: { solicitacao_id: solicitacaoId },
    });

    this.logger.log(`Todos os anexos da solicitação ${solicitacaoId} foram removidos`);
  }

  /**
   * Obter estatísticas de anexos
   */
  async getEstatisticasAnexos(
    solicitacaoId: string,
  ): Promise<{
    total: number;
    tamanhoTotal: number;
    porTipo: Record<string, number>;
  }> {
    await this.solicitacoesService.findOne(solicitacaoId);

    const anexos = await this.prisma.anexos_solicitacao_servico.findMany({
      where: { solicitacao_id: solicitacaoId },
      select: {
        tamanho: true,
        tipo_documento: true,
      },
    });

    const total = anexos.length;
    const tamanhoTotal = anexos.reduce((acc, anexo) => acc + anexo.tamanho, 0);

    const porTipo: Record<string, number> = {};
    anexos.forEach((anexo) => {
      const tipo = anexo.tipo_documento || 'Sem tipo';
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    });

    return {
      total,
      tamanhoTotal,
      porTipo,
    };
  }
}
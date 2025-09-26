import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateAnexoAnomaliaDto, AnexoAnomaliaResponseDto } from './dto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class AnexosAnomaliasService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly TIPOS_PERMITIDOS = ['png', 'pdf', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'];
  private readonly TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB

  async uploadAnexo(
    anomaliaId: string,
    file: any,
    descricao?: string,
    usuarioId?: string
  ): Promise<AnexoAnomaliaResponseDto> {
    await this.verificarAnomaliaExiste(anomaliaId);
    this.validarArquivo(file);

    const nomeArquivo = this.gerarNomeUnico(file.originalname);
    const caminhoLocal = await this.salvarArquivoLocal(file, nomeArquivo);

    const anexoData: CreateAnexoAnomaliaDto = {
      nome: nomeArquivo,
      nome_original: file.originalname,
      tipo: this.extrairExtensao(file.originalname),
      mime_type: file.mimetype,
      tamanho: file.size,
      descricao,
      caminho_s3: caminhoLocal, // Por enquanto salvamos local, depois pode ser migrado para S3
      url_download: `/anexos/${nomeArquivo}`
    };

    const anexo = await this.prisma.anexos_anomalias.create({
      data: {
        ...anexoData,
        anomalia: { connect: { id: anomaliaId } },
        ...(usuarioId && {
          usuario: { connect: { id: usuarioId } }
        })
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true
          }
        }
      }
    });

    return this.mapearParaResponse(anexo);
  }

  async listarAnexosAnomalia(anomaliaId: string): Promise<AnexoAnomaliaResponseDto[]> {
    await this.verificarAnomaliaExiste(anomaliaId);

    const anexos = await this.prisma.anexos_anomalias.findMany({
      where: {
        anomalia_id: anomaliaId,
        deleted_at: null
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return anexos.map(anexo => this.mapearParaResponse(anexo));
  }

  async buscarAnexo(anexoId: string): Promise<AnexoAnomaliaResponseDto> {
    const anexo = await this.prisma.anexos_anomalias.findFirst({
      where: {
        id: anexoId,
        deleted_at: null
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true
          }
        }
      }
    });

    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado');
    }

    return this.mapearParaResponse(anexo);
  }

  async removerAnexo(anexoId: string, usuarioId?: string): Promise<void> {
    const anexo = await this.buscarAnexo(anexoId);

    await this.prisma.anexos_anomalias.update({
      where: { id: anexoId },
      data: { deleted_at: new Date() }
    });

    // Remover arquivo físico
    try {
      if (fs.existsSync(anexo.caminho_s3)) {
        fs.unlinkSync(anexo.caminho_s3);
      }
    } catch (error) {
      console.error('Erro ao remover arquivo físico:', error);
    }
  }

  async obterCaminhoArquivo(anexoId: string): Promise<string> {
    const anexo = await this.buscarAnexo(anexoId);
    
    if (!fs.existsSync(anexo.caminho_s3)) {
      throw new NotFoundException('Arquivo não encontrado no sistema de arquivos');
    }

    return anexo.caminho_s3;
  }

  private async verificarAnomaliaExiste(anomaliaId: string): Promise<void> {
    const anomalia = await this.prisma.anomalias.findFirst({
      where: {
        id: anomaliaId,
        deleted_at: null
      }
    });

    if (!anomalia) {
      throw new NotFoundException('Anomalia não encontrada');
    }
  }

  private validarArquivo(file: any): void {
    if (!file) {
      throw new BadRequestException('Arquivo é obrigatório');
    }

    const extensao = this.extrairExtensao(file.originalname);
    if (!this.TIPOS_PERMITIDOS.includes(extensao)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido. Tipos aceitos: ${this.TIPOS_PERMITIDOS.join(', ')}`
      );
    }

    if (file.size > this.TAMANHO_MAXIMO) {
      throw new BadRequestException(
        `Arquivo muito grande. Tamanho máximo: ${this.TAMANHO_MAXIMO / (1024 * 1024)}MB`
      );
    }
  }

  private extrairExtensao(nomeArquivo: string): string {
    return path.extname(nomeArquivo).toLowerCase().substring(1);
  }

  private gerarNomeUnico(nomeOriginal: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const extensao = path.extname(nomeOriginal);
    const nomeBase = path.basename(nomeOriginal, extensao);
    
    return `${nomeBase}_${timestamp}_${random}${extensao}`;
  }

  private async salvarArquivoLocal(file: any, nomeArquivo: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'anexos');
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const caminhoCompleto = path.join(uploadDir, nomeArquivo);
    fs.writeFileSync(caminhoCompleto, file.buffer);

    return caminhoCompleto;
  }

  private mapearParaResponse(anexo: any): AnexoAnomaliaResponseDto {
    return {
      id: anexo.id,
      nome: anexo.nome,
      nome_original: anexo.nome_original,
      tipo: anexo.tipo,
      mime_type: anexo.mime_type,
      tamanho: Number(anexo.tamanho),
      descricao: anexo.descricao,
      caminho_s3: anexo.caminho_s3,
      url_download: anexo.url_download,
      anomalia_id: anexo.anomalia_id,
      usuario_id: anexo.usuario_id,
      usuario: anexo.usuario,
      created_at: anexo.created_at,
      updated_at: anexo.updated_at
    };
  }
}
// src/modules/instrucoes/anexos-instrucoes.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AnexoInstrucaoDetalhesDto } from './dto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class AnexosInstrucoesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly TIPOS_PERMITIDOS = ['png', 'pdf', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'txt'];
  private readonly TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB

  async uploadAnexo(
    instrucaoId: string,
    file: any,
    descricao?: string,
    usuarioId?: string
  ): Promise<AnexoInstrucaoDetalhesDto> {
    await this.verificarInstrucaoExiste(instrucaoId);
    this.validarArquivo(file);

    const nomeArquivo = this.gerarNomeUnico(file.originalname);
    await this.salvarArquivoLocal(file, nomeArquivo);

    const anexoData = {
      nome: nomeArquivo,
      tipo: this.determinarTipoAnexo(file.originalname),
      url: `/instrucoes/${instrucaoId}/anexos/${nomeArquivo}/download`,
      tamanho: file.size,
      content_type: file.mimetype
    };

    const anexo = await this.prisma.anexos_instrucao.create({
      data: {
        ...anexoData,
        instrucao: { connect: { id: instrucaoId } }
      }
    });

    return this.mapearParaResponse(anexo);
  }

  async listarAnexosInstrucao(instrucaoId: string): Promise<AnexoInstrucaoDetalhesDto[]> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const anexos = await this.prisma.anexos_instrucao.findMany({
      where: { instrucao_id: instrucaoId },
      orderBy: { created_at: 'desc' }
    });

    return anexos.map(anexo => this.mapearParaResponse(anexo));
  }

  async buscarAnexo(anexoId: string): Promise<AnexoInstrucaoDetalhesDto> {
    const anexo = await this.prisma.anexos_instrucao.findUnique({
      where: { id: anexoId }
    });

    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado');
    }

    return this.mapearParaResponse(anexo);
  }

  async removerAnexo(anexoId: string): Promise<void> {
    const anexo = await this.buscarAnexo(anexoId);

    await this.prisma.anexos_instrucao.delete({
      where: { id: anexoId }
    });

    // Remover arquivo físico
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', 'instrucoes', 'anexos');
      const caminhoArquivo = path.join(uploadDir, anexo.nome);
      if (fs.existsSync(caminhoArquivo)) {
        fs.unlinkSync(caminhoArquivo);
      }
    } catch (error) {
      console.error('Erro ao remover arquivo físico:', error);
    }
  }

  async obterCaminhoArquivo(anexoId: string): Promise<string> {
    const anexo = await this.buscarAnexo(anexoId);

    const uploadDir = path.join(process.cwd(), 'uploads', 'instrucoes', 'anexos');
    const caminhoArquivo = path.join(uploadDir, anexo.nome);

    if (!fs.existsSync(caminhoArquivo)) {
      throw new NotFoundException('Arquivo não encontrado no sistema de arquivos');
    }

    return caminhoArquivo;
  }

  private async verificarInstrucaoExiste(instrucaoId: string): Promise<void> {
    const instrucao = await this.prisma.instrucoes.findFirst({
      where: { id: instrucaoId, deleted_at: null }
    });

    if (!instrucao) {
      throw new NotFoundException('Instrução não encontrada');
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

  private determinarTipoAnexo(nomeArquivo: string): any {
    const extensao = this.extrairExtensao(nomeArquivo);

    switch (extensao) {
      case 'pdf':
        return 'MANUAL';
      case 'doc':
      case 'docx':
        return 'PROCEDIMENTO';
      case 'xls':
      case 'xlsx':
        return 'MODELO_RELATORIO';
      default:
        return 'OUTROS';
    }
  }

  private gerarNomeUnico(nomeOriginal: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const extensao = path.extname(nomeOriginal);
    const nomeBase = path.basename(nomeOriginal, extensao);

    return `${nomeBase}_${timestamp}_${random}${extensao}`;
  }

  private async salvarArquivoLocal(file: any, nomeArquivo: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'instrucoes', 'anexos');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const caminhoCompleto = path.join(uploadDir, nomeArquivo);
    fs.writeFileSync(caminhoCompleto, file.buffer);

    return caminhoCompleto;
  }

  private mapearParaResponse(anexo: any): AnexoInstrucaoDetalhesDto {
    return {
      id: anexo.id,
      nome: anexo.nome,
      tipo: anexo.tipo,
      url: anexo.url,
      tamanho: anexo.tamanho,
      content_type: anexo.content_type,
      instrucao_id: anexo.instrucao_id,
      created_at: anexo.created_at,
      updated_at: anexo.updated_at
    };
  }
}

// src/modules/tarefas/anexos-tarefas.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateAnexoTarefaDto, AnexoTarefaDetalhesDto } from './dto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class AnexosTarefasService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly TIPOS_PERMITIDOS = ['png', 'pdf', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'txt'];
  private readonly TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB

  async uploadAnexo(
    tarefaId: string,
    file: any,
    descricao?: string,
    usuarioId?: string
  ): Promise<AnexoTarefaDetalhesDto> {
    await this.verificarTarefaExiste(tarefaId);
    this.validarArquivo(file);

    const nomeArquivo = this.gerarNomeUnico(file.originalname);
    const caminhoLocal = await this.salvarArquivoLocal(file, nomeArquivo);

    const anexoData = {
      nome: nomeArquivo,
      tipo: this.determinarTipoAnexo(file.originalname),
      url: `/tarefas/${tarefaId}/anexos/${nomeArquivo}/download`,
      tamanho: file.size,
      content_type: file.mimetype
    };

    const anexo = await this.prisma.anexos_tarefa.create({
      data: {
        ...anexoData,
        tarefa: { connect: { id: tarefaId } }
      }
    });

    return this.mapearParaResponse(anexo);
  }

  async listarAnexosTarefa(tarefaId: string): Promise<AnexoTarefaDetalhesDto[]> {
    await this.verificarTarefaExiste(tarefaId);

    const anexos = await this.prisma.anexos_tarefa.findMany({
      where: {
        tarefa_id: tarefaId
      },
      orderBy: { created_at: 'desc' }
    });

    return anexos.map(anexo => this.mapearParaResponse(anexo));
  }

  async buscarAnexo(anexoId: string): Promise<AnexoTarefaDetalhesDto> {
    const anexo = await this.prisma.anexos_tarefa.findUnique({
      where: { id: anexoId }
    });

    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado');
    }

    return this.mapearParaResponse(anexo);
  }

  async removerAnexo(anexoId: string): Promise<void> {
    const anexo = await this.buscarAnexo(anexoId);

    await this.prisma.anexos_tarefa.delete({
      where: { id: anexoId }
    });

    // Remover arquivo físico
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', 'tarefas', 'anexos');
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
    
    // Generate local file path based on anexo name
    const uploadDir = path.join(process.cwd(), 'uploads', 'tarefas', 'anexos');
    const caminhoArquivo = path.join(uploadDir, anexo.nome);
    
    if (!fs.existsSync(caminhoArquivo)) {
      throw new NotFoundException('Arquivo não encontrado no sistema de arquivos');
    }

    return caminhoArquivo;
  }

  private async verificarTarefaExiste(tarefaId: string): Promise<void> {
    const tarefa = await this.prisma.tarefas.findFirst({
      where: {
        id: tarefaId,
        deleted_at: null
      }
    });

    if (!tarefa) {
      throw new NotFoundException('Tarefa não encontrada');
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
    const uploadDir = path.join(process.cwd(), 'uploads', 'tarefas', 'anexos');
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const caminhoCompleto = path.join(uploadDir, nomeArquivo);
    fs.writeFileSync(caminhoCompleto, file.buffer);

    return caminhoCompleto;
  }

  private mapearParaResponse(anexo: any): AnexoTarefaDetalhesDto {
    return {
      id: anexo.id,
      nome: anexo.nome,
      tipo: anexo.tipo,
      url: anexo.url,
      tamanho: anexo.tamanho,
      content_type: anexo.content_type,
      tarefa_id: anexo.tarefa_id,
      created_at: anexo.created_at,
      updated_at: anexo.updated_at
    };
  }
}
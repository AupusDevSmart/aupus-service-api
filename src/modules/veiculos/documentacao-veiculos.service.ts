import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TipoDocumentacaoVeiculo } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

export interface DocumentacaoVeiculoResponseDto {
  id: string;
  tipo: TipoDocumentacaoVeiculo;
  descricao: string;
  dataVencimento?: Date;
  numeroDocumento?: string;
  orgaoEmissor?: string;
  observacoes?: string;
  arquivo?: string;
  nomeArquivo?: string;
  nomeArquivoOriginal?: string;
  tipoArquivo?: string;
  mimeType?: string;
  tamanhoArquivo?: number;
  urlDownload?: string;
  veiculoId: string;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
  criadoPor?: string;
  criadoPorId?: string;
}

export interface CreateDocumentacaoVeiculoDto {
  tipo: TipoDocumentacaoVeiculo;
  descricao: string;
  dataVencimento?: Date;
  numeroDocumento?: string;
  orgaoEmissor?: string;
  observacoes?: string;
  criadoPor?: string;
  criadoPorId?: string;
}

export interface UpdateDocumentacaoVeiculoDto {
  tipo?: TipoDocumentacaoVeiculo;
  descricao?: string;
  dataVencimento?: Date;
  numeroDocumento?: string;
  orgaoEmissor?: string;
  observacoes?: string;
}

@Injectable()
export class DocumentacaoVeiculosService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly TIPOS_PERMITIDOS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
  private readonly TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB

  async criarDocumentacao(
    veiculoId: string,
    createDto: CreateDocumentacaoVeiculoDto
  ): Promise<DocumentacaoVeiculoResponseDto> {
    await this.verificarVeiculoExiste(veiculoId);

    // Verificar se já existe documentação do mesmo tipo ativa
    const existente = await this.prisma.documentacao_veiculo.findFirst({
      where: {
        veiculo_id: veiculoId,
        tipo: createDto.tipo,
        ativo: true
      }
    });

    if (existente) {
      throw new ConflictException(`Já existe documentação ativa do tipo ${createDto.tipo} para este veículo`);
    }

    const documentacao = await this.prisma.documentacao_veiculo.create({
      data: {
        tipo: createDto.tipo,
        descricao: createDto.descricao,
        data_vencimento: createDto.dataVencimento,
        numero_documento: createDto.numeroDocumento,
        orgao_emissor: createDto.orgaoEmissor,
        observacoes: createDto.observacoes,
        veiculo_id: veiculoId,
        upload_por: createDto.criadoPor,
        upload_por_id: createDto.criadoPorId,
        ativo: true
      }
    });

    return this.mapearParaResponse(documentacao);
  }

  async uploadArquivo(
    documentacaoId: string,
    file: any,
    usuarioId?: string
  ): Promise<DocumentacaoVeiculoResponseDto> {
    const documentacao = await this.buscarPorId(documentacaoId);
    this.validarArquivo(file);

    const nomeArquivo = this.gerarNomeUnico(file.originalname);
    const caminhoLocal = await this.salvarArquivoLocal(file, nomeArquivo);
    const extensao = this.extrairExtensao(file.originalname);
    const mimeType = this.obterMimeType(extensao);

    const documentacaoAtualizada = await this.prisma.documentacao_veiculo.update({
      where: { id: documentacaoId },
      data: {
        caminho_arquivo: caminhoLocal,
        nome_arquivo: nomeArquivo,
        tipo_arquivo: extensao,
        tamanho_arquivo: file.size,
        data_upload: new Date()
      }
    });

    return this.mapearParaResponse(documentacaoAtualizada);
  }

  async listarPorVeiculo(veiculoId: string, incluirInativos = false): Promise<DocumentacaoVeiculoResponseDto[]> {
    await this.verificarVeiculoExiste(veiculoId);

    const documentacoes = await this.prisma.documentacao_veiculo.findMany({
      where: {
        veiculo_id: veiculoId,
        ...(incluirInativos ? {} : { ativo: true })
      },
      orderBy: [
        { data_vencimento: 'asc' },
        { criado_em: 'desc' }
      ]
    });

    return documentacoes.map(doc => this.mapearParaResponse(doc));
  }

  async buscarPorId(id: string): Promise<DocumentacaoVeiculoResponseDto> {
    const documentacao = await this.prisma.documentacao_veiculo.findUnique({
      where: { id }
    });

    if (!documentacao) {
      throw new NotFoundException(`Documentação com ID ${id} não encontrada`);
    }

    return this.mapearParaResponse(documentacao);
  }

  async atualizar(
    id: string,
    updateDto: UpdateDocumentacaoVeiculoDto
  ): Promise<DocumentacaoVeiculoResponseDto> {
    const documentacaoExistente = await this.buscarPorId(id);

    // Se está alterando o tipo, verificar se não haverá conflito
    if (updateDto.tipo && updateDto.tipo !== documentacaoExistente.tipo) {
      const conflito = await this.prisma.documentacao_veiculo.findFirst({
        where: {
          veiculo_id: documentacaoExistente.veiculoId,
          tipo: updateDto.tipo,
          ativo: true,
          NOT: { id }
        }
      });

      if (conflito) {
        throw new ConflictException(`Já existe documentação ativa do tipo ${updateDto.tipo} para este veículo`);
      }
    }

    const documentacao = await this.prisma.documentacao_veiculo.update({
      where: { id },
      data: {
        tipo: updateDto.tipo,
        descricao: updateDto.descricao,
        data_vencimento: updateDto.dataVencimento,
        numero_documento: updateDto.numeroDocumento,
        orgao_emissor: updateDto.orgaoEmissor,
        observacoes: updateDto.observacoes
      }
    });

    return this.mapearParaResponse(documentacao);
  }

  async inativar(id: string): Promise<void> {
    await this.buscarPorId(id);

    await this.prisma.documentacao_veiculo.update({
      where: { id },
      data: { ativo: false }
    });
  }

  async remover(id: string): Promise<void> {
    const documentacao = await this.prisma.documentacao_veiculo.findUnique({
      where: { id }
    });

    if (!documentacao) {
      throw new NotFoundException(`Documentação com ID ${id} não encontrada`);
    }

    // Remover arquivo físico se existir
    if (documentacao.caminho_arquivo && fs.existsSync(documentacao.caminho_arquivo)) {
      try {
        fs.unlinkSync(documentacao.caminho_arquivo);
      } catch (error) {
        console.error('Erro ao remover arquivo físico:', error);
      }
    }

    await this.prisma.documentacao_veiculo.delete({
      where: { id }
    });
  }

  async obterCaminhoArquivo(id: string): Promise<string> {
    const documentacao = await this.prisma.documentacao_veiculo.findUnique({
      where: { id }
    });

    if (!documentacao) {
      throw new NotFoundException(`Documentação com ID ${id} não encontrada`);
    }

    if (!documentacao.caminho_arquivo) {
      throw new NotFoundException('Nenhum arquivo associado a esta documentação');
    }

    if (!fs.existsSync(documentacao.caminho_arquivo)) {
      throw new NotFoundException('Arquivo não encontrado no sistema de arquivos');
    }

    return documentacao.caminho_arquivo;
  }

  async listarVencendoEm(dias: number = 30, veiculoId?: string): Promise<DocumentacaoVeiculoResponseDto[]> {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + dias);

    const documentacoes = await this.prisma.documentacao_veiculo.findMany({
      where: {
        ativo: true,
        data_vencimento: {
          lte: dataLimite,
          gte: new Date()
        },
        ...(veiculoId && { veiculo_id: veiculoId })
      },
      include: {
        veiculo: {
          select: {
            id: true,
            nome: true,
            placa: true
          }
        }
      },
      orderBy: { data_vencimento: 'asc' }
    });

    return documentacoes.map(doc => this.mapearParaResponse(doc));
  }

  async listarVencidas(veiculoId?: string): Promise<DocumentacaoVeiculoResponseDto[]> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const documentacoes = await this.prisma.documentacao_veiculo.findMany({
      where: {
        ativo: true,
        data_vencimento: {
          lt: hoje
        },
        ...(veiculoId && { veiculo_id: veiculoId })
      },
      include: {
        veiculo: {
          select: {
            id: true,
            nome: true,
            placa: true
          }
        }
      },
      orderBy: { data_vencimento: 'desc' }
    });

    return documentacoes.map(doc => this.mapearParaResponse(doc));
  }

  async contarAlertas(veiculoId: string): Promise<number> {
    const hoje = new Date();
    const em30Dias = new Date();
    em30Dias.setDate(hoje.getDate() + 30);

    const count = await this.prisma.documentacao_veiculo.count({
      where: {
        veiculo_id: veiculoId,
        ativo: true,
        data_vencimento: {
          lte: em30Dias
        }
      }
    });

    return count;
  }

  private async verificarVeiculoExiste(veiculoId: string): Promise<void> {
    const veiculo = await this.prisma.veiculo.findUnique({
      where: { id: veiculoId }
    });

    if (!veiculo) {
      throw new NotFoundException('Veículo não encontrado');
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

  private obterMimeType(extensao: string): string {
    const mimeTypes = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return mimeTypes[extensao?.toLowerCase()] || 'application/octet-stream';
  }

  private gerarNomeUnico(nomeOriginal: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const extensao = path.extname(nomeOriginal);
    const nomeBase = path.basename(nomeOriginal, extensao);

    return `${nomeBase}_${timestamp}_${random}${extensao}`;
  }

  private async salvarArquivoLocal(file: any, nomeArquivo: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'documentacao-veiculos');

    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const caminhoCompleto = path.join(uploadDir, nomeArquivo);
    fs.writeFileSync(caminhoCompleto, file.buffer);

    return caminhoCompleto;
  }

  private mapearParaResponse(documentacao: any): DocumentacaoVeiculoResponseDto {
    return {
      id: documentacao.id,
      tipo: documentacao.tipo,
      descricao: documentacao.descricao,
      dataVencimento: documentacao.data_vencimento,
      numeroDocumento: documentacao.numero_documento,
      orgaoEmissor: documentacao.orgao_emissor,
      observacoes: documentacao.observacoes,
      arquivo: documentacao.caminho_arquivo,
      nomeArquivo: documentacao.nome_arquivo,
      nomeArquivoOriginal: documentacao.nome_arquivo,
      tipoArquivo: documentacao.tipo_arquivo,
      mimeType: this.obterMimeType(documentacao.tipo_arquivo),
      tamanhoArquivo: documentacao.tamanho_arquivo ? Number(documentacao.tamanho_arquivo) : undefined,
      urlDownload: documentacao.caminho_arquivo ? `/documentacao/veiculos/${documentacao.id}/download` : undefined,
      veiculoId: documentacao.veiculo_id,
      ativo: documentacao.ativo,
      criadoEm: documentacao.criado_em,
      atualizadoEm: documentacao.atualizado_em,
      criadoPor: documentacao.upload_por,
      criadoPorId: documentacao.upload_por_id
    };
  }
}
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PermissionScopeService, PrismaService, TipoAnexoOS, anexos_os } from '@/core';
import { AnexoOSResponseDto } from './dto';
import { exigirOSAlteravel } from './os-alteravel';
import * as path from 'path';
import * as fs from 'fs';

/** Quem pede: o usuário do JWT. Sem ele (chamada interna), o escopo não se aplica. */
type Solicitante = { id: string; role?: string | null; permissions?: string[] };

/**
 * Anexos da OS: as fotos (antes, durante, depois) e os documentos que provam o
 * que foi feito. Ficam presos à OS (um anexo nunca é achado pela OS errada),
 * só para quem enxerga a planta, e congelam com a OS finalizada ou cancelada.
 * Excluir é lógico: o arquivo continua no disco, porque a prova não some.
 */
@Injectable()
export class AnexosOSService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  /** Imagens do celular (heic/heif do iPhone, webp do Android) e documentos. */
  private readonly TIPOS_PERMITIDOS = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
  private readonly TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB

  async uploadAnexo(
    osId: string,
    file: Express.Multer.File | { originalname: string; mimetype: string; size: number; buffer: Buffer },
    tipo: TipoAnexoOS,
    descricao?: string,
    faseExecucao?: string,
    solicitante?: Solicitante,
  ): Promise<AnexoOSResponseDto> {
    const os = await this.osVisivel(osId, solicitante);
    exigirOSAlteravel(os.status);
    if (!Object.values(TipoAnexoOS).includes(tipo)) {
      throw new BadRequestException(`Tipo de anexo inválido. Use: ${Object.values(TipoAnexoOS).join(', ')}`);
    }
    this.validarArquivo(file);

    const nomeArquivo = this.gerarNomeUnico(file.originalname);
    const caminhoLocal = await this.salvarArquivoLocal(file, nomeArquivo);

    const anexo = await this.prisma.anexos_os.create({
      data: {
        nome: nomeArquivo,
        nome_original: file.originalname,
        tipo,
        mime_type: file.mimetype,
        tamanho: file.size,
        descricao,
        caminho_s3: caminhoLocal,
        url_download: `/anexos-os/${nomeArquivo}`,
        fase_execucao: faseExecucao ?? os.status,
        uploaded_by: await this.nomeDe(solicitante?.id),
        uploaded_by_id: solicitante?.id,
        ordem_servico: { connect: { id: os.id } },
      },
    });

    return this.mapearParaResponse(anexo);
  }

  async listarAnexosOS(osId: string, solicitante?: Solicitante): Promise<AnexoOSResponseDto[]> {
    const os = await this.osVisivel(osId, solicitante);

    const anexos = await this.prisma.anexos_os.findMany({
      where: { os_id: os.id, deletado_em: null },
      orderBy: { uploaded_at: 'desc' },
    });

    return anexos.map((anexo) => this.mapearParaResponse(anexo));
  }

  async buscarAnexo(osId: string, anexoId: string, solicitante?: Solicitante): Promise<AnexoOSResponseDto> {
    const os = await this.osVisivel(osId, solicitante);
    return this.mapearParaResponse(await this.anexoDaOS(os.id, anexoId));
  }

  async removerAnexo(osId: string, anexoId: string, solicitante?: Solicitante): Promise<void> {
    const os = await this.osVisivel(osId, solicitante);
    const anexo = await this.anexoDaOS(os.id, anexoId);
    exigirOSAlteravel(os.status);

    await this.prisma.anexos_os.update({
      where: { id: anexo.id },
      data: { deletado_em: new Date() },
    });
  }

  async obterCaminhoArquivo(osId: string, anexoId: string, solicitante?: Solicitante): Promise<string> {
    const anexo = await this.buscarAnexo(osId, anexoId, solicitante);

    if (!fs.existsSync(anexo.caminho_s3)) {
      throw new NotFoundException('Arquivo não encontrado no sistema de arquivos');
    }

    return anexo.caminho_s3;
  }

  /** A OS existe e o solicitante enxerga a planta dela. */
  private async osVisivel(osId: string, solicitante?: Solicitante) {
    const os = await this.prisma.ordens_servico.findFirst({
      where: { id: osId.trim(), deletado_em: null },
      select: { id: true, status: true },
    });
    if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
    if (solicitante) await this.scopeService.assertEntityInScope('ordem_servico', os.id, solicitante);
    return os;
  }

  private async anexoDaOS(osId: string, anexoId: string): Promise<anexos_os> {
    const anexo = await this.prisma.anexos_os.findFirst({
      where: { id: anexoId.trim(), os_id: osId, deletado_em: null },
    });
    if (!anexo) throw new NotFoundException('Anexo não encontrado');
    return anexo;
  }

  private async nomeDe(usuarioId?: string): Promise<string | null> {
    if (!usuarioId) return null;
    const usuario = await this.prisma.usuarios.findUnique({ where: { id: usuarioId.trim() }, select: { nome: true } });
    return usuario?.nome ?? null;
  }

  private validarArquivo(file: { originalname: string; size: number } | undefined): void {
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

  private async salvarArquivoLocal(file: { buffer: Buffer }, nomeArquivo: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'anexos-os');

    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const caminhoCompleto = path.join(uploadDir, nomeArquivo);
    fs.writeFileSync(caminhoCompleto, file.buffer);

    return caminhoCompleto;
  }

  private mapearParaResponse(anexo: anexos_os): AnexoOSResponseDto {
    return {
      id: anexo.id,
      os_id: anexo.os_id,
      nome: anexo.nome,
      nome_original: anexo.nome_original,
      tipo: anexo.tipo,
      mime_type: anexo.mime_type,
      tamanho: Number(anexo.tamanho),
      descricao: anexo.descricao,
      caminho_s3: anexo.caminho_s3,
      url_download: anexo.url_download,
      fase_execucao: anexo.fase_execucao,
      uploaded_at: anexo.uploaded_at,
      uploaded_by: anexo.uploaded_by,
      uploaded_by_id: anexo.uploaded_by_id,
      deletado_em: anexo.deletado_em,
    };
  }
}

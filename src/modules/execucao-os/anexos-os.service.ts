import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PermissionScopeService, PrismaService, TipoAnexoOS, anexos_os } from '@/core';
import { AnexoOSResponseDto } from './dto';
import { createHash } from 'node:crypto';
import { exigirOSAlteravel, travarOSAlteravel } from './os-alteravel';
import { conferirConteudo, extensaoDe, tipoPelaExtensao } from '@/common/upload/tipo-do-arquivo';
import * as path from 'path';
import * as fs from 'fs';

/** Quem pede: o usuário do JWT. Sem ele (chamada interna), o escopo não se aplica. */
export type Solicitante = { id: string; role?: string | null; permissions?: string[] };

/** O que o anexo prova (SN-59). Os dois vazios: o anexo geral da OS. */
export type DestinoDoAnexo = { tarefa_os_id?: string; checklist_item_id?: string };

/**
 * A foto que conta para o item que exige foto: imagem, não documento. O mime é
 * o que o servidor tira da extensão (e confere no conteúdo) ao receber, sempre
 * em minúscula — o filtro `startsWith` das consultas e este dizem o mesmo.
 */
export const PREFIXO_DE_FOTO = 'image/';
export const ehFoto = (mime: string | null | undefined) => !!mime && mime.startsWith(PREFIXO_DE_FOTO);

/** O anexo como a API devolve, na listagem e dentro da OS (antes o mapa era escrito duas vezes). */
export function anexoParaResposta(anexo: anexos_os): AnexoOSResponseDto {
  return {
    id: anexo.id,
    os_id: anexo.os_id,
    nome: anexo.nome,
    nome_original: anexo.nome_original,
    tipo: anexo.tipo,
    mime_type: anexo.mime_type,
    tamanho: Number(anexo.tamanho),
    descricao: anexo.descricao,
    url_download: anexo.url_download,
    fase_execucao: anexo.fase_execucao,
    uploaded_at: anexo.uploaded_at,
    uploaded_by: anexo.uploaded_by,
    uploaded_by_id: anexo.uploaded_by_id,
    deletado_em: anexo.deletado_em,
    tarefa_os_id: anexo.tarefa_os_id?.trim() ?? null,
    checklist_item_id: anexo.checklist_item_id?.trim() ?? null,
  };
}

/**
 * Anexos da OS: as fotos (antes, durante, depois) e os documentos que provam o
 * que foi feito. Ficam presos à OS (um anexo nunca é achado pela OS errada),
 * só para quem enxerga a planta, e congelam com a OS finalizada ou cancelada.
 * Excluir é lógico: o arquivo continua no disco, porque a prova não some.
 */
@Injectable()
export class AnexosOSService {
  private readonly logger = new Logger(AnexosOSService.name);

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
    destino: DestinoDoAnexo = {},
  ): Promise<AnexoOSResponseDto> {
    const os = await this.osVisivel(osId, solicitante);
    exigirOSAlteravel(os.status);
    if (!Object.values(TipoAnexoOS).includes(tipo)) {
      throw new BadRequestException(`Tipo de anexo inválido. Use: ${Object.values(TipoAnexoOS).join(', ')}`);
    }
    this.validarArquivo(file);
    // O conteúdo tem de ser o da extensão: o PDF renomeado para ".jpg" contava
    // como foto, e o SVG renomeado para ".png" era o vetor de script
    conferirConteudo(file.originalname, file.buffer);
    // Antes de gravar o arquivo: destino de outra OS não deixa arquivo solto no disco
    const vinculo = await this.destinoNaOS(os.id, destino);

    const autor = await this.nomeDe(solicitante?.id);
    const nomeArquivo = this.gerarNomeUnico(file.originalname);
    const caminhoLocal = await this.salvarArquivoLocal(file, nomeArquivo);

    // O registro falhando, o arquivo sai do disco: antes ficava solto, sem linha
    // no banco e sem log (texto longo demais numa coluna, a API nova antes do SQL).
    // Com a OS travada e o status conferido de novo: o finalizar no meio deixava
    // o anexo fora do conteúdo que o código de verificação prova (SN-62)
    const anexo = await this.prisma.$transaction(async (tx) => {
      await travarOSAlteravel(tx, os.id);
      return tx.anexos_os.create({
      data: {
        nome: nomeArquivo,
        nome_original: file.originalname,
        tipo,
        // Pela extensão, não o Content-Type que o cliente declara (revisão do SN-59)
        mime_type: tipoPelaExtensao(file.originalname),
        tamanho: file.size,
        descricao,
        caminho_s3: caminhoLocal,
        url_download: `/anexos-os/${nomeArquivo}`,
        fase_execucao: faseExecucao ?? os.status,
        uploaded_by: autor,
        uploaded_by_id: solicitante?.id,
        // SN-62: a soma do arquivo, do buffer que acabou de ser gravado. O finalizar
        // e o PDF usam esta; só a conferência relê o disco
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        ordem_servico: { connect: { id: os.id } },
        ...(vinculo.tarefa_os_id && { tarefa_os: { connect: { id: vinculo.tarefa_os_id } } }),
        ...(vinculo.checklist_item_id && { checklist_item: { connect: { id: vinculo.checklist_item_id } } }),
      },
      });
    }).catch((erro: unknown) => {
      try {
        fs.unlinkSync(caminhoLocal);
      } catch (erroAoApagar) {
        this.logger.error(`Anexo sem registro ficou no disco: ${caminhoLocal}`, erroAoApagar instanceof Error ? erroAoApagar.stack : String(erroAoApagar));
      }
      throw erro;
    });

    return anexoParaResposta(anexo);
  }

  /**
   * O destino do anexo, conferido nesta OS: item e tarefa de outra OS são 404.
   * Do item vem a tarefa dele — a foto do item também é da tarefa, e a tela
   * agrupa assim; mandar uma tarefa que não é a do item é 400.
   */
  private async destinoNaOS(osId: string, destino: DestinoDoAnexo): Promise<{ tarefa_os_id: string | null; checklist_item_id: string | null }> {
    const itemId = destino.checklist_item_id?.trim() || null;
    const tarefaId = destino.tarefa_os_id?.trim() || null;

    if (itemId) {
      const item = await this.prisma.checklist_atividades_os.findFirst({ where: { id: itemId, os_id: osId }, select: { id: true, tarefa_os_id: true } });
      if (!item) throw new NotFoundException('Item do checklist não encontrado nesta OS');
      // O id como o banco guarda vai no connect; aparado, só na comparação
      if (tarefaId && tarefaId !== item.tarefa_os_id?.trim()) throw new BadRequestException('O item do checklist não é dessa tarefa');
      return { tarefa_os_id: item.tarefa_os_id, checklist_item_id: item.id };
    }
    if (tarefaId) {
      const tarefa = await this.prisma.tarefas_os.findFirst({ where: { id: tarefaId, os_id: osId }, select: { id: true } });
      if (!tarefa) throw new NotFoundException('Tarefa não encontrada nesta OS');
      return { tarefa_os_id: tarefa.id, checklist_item_id: null };
    }
    return { tarefa_os_id: null, checklist_item_id: null };
  }

  async listarAnexosOS(osId: string, solicitante?: Solicitante): Promise<AnexoOSResponseDto[]> {
    const os = await this.osVisivel(osId, solicitante);

    const anexos = await this.prisma.anexos_os.findMany({
      where: { os_id: os.id, deletado_em: null },
      orderBy: { uploaded_at: 'desc' },
    });

    return anexos.map(anexoParaResposta);
  }

  async buscarAnexo(osId: string, anexoId: string, solicitante?: Solicitante): Promise<AnexoOSResponseDto> {
    const os = await this.osVisivel(osId, solicitante);
    return anexoParaResposta(await this.anexoDaOS(os.id, anexoId));
  }

  async removerAnexo(osId: string, anexoId: string, solicitante?: Solicitante): Promise<void> {
    const os = await this.osVisivel(osId, solicitante);
    const anexo = await this.anexoDaOS(os.id, anexoId);
    exigirOSAlteravel(os.status);

    await this.prisma.$transaction(async (tx) => {
      // A OS primeiro (SN-62): excluir durante o finalizar tirava o anexo depois
      // de ele entrar no conteúdo
      await travarOSAlteravel(tx, os.id);
      // A última foto do item marcado que exige foto não sai: o item ficaria
      // feito sem a prova. O item travado (FOR UPDATE, como no PATCH do
      // checklist): marcar e excluir ao mesmo tempo esperam um pelo outro
      if (anexo.checklist_item_id && ehFoto(anexo.mime_type)) {
        const [item] = await tx.$queryRaw<Array<{ atividade: string; exige_foto: boolean; concluida: boolean }>>`
          SELECT atividade, exige_foto, concluida FROM checklist_atividades_os
           WHERE id = ${anexo.checklist_item_id} AND os_id = ${os.id} FOR NO KEY UPDATE`;
        if (item?.exige_foto && item.concluida) {
          const outras = await tx.anexos_os.count({
            where: { checklist_item_id: anexo.checklist_item_id, deletado_em: null, id: { not: anexo.id }, mime_type: { startsWith: PREFIXO_DE_FOTO } },
          });
          if (outras === 0) {
            throw new ConflictException(`Desmarque o item "${item.atividade}" antes de excluir a última foto dele.`);
          }
        }
      }

      await tx.anexos_os.update({
        where: { id: anexo.id },
        data: { deletado_em: new Date() },
      });
    });
  }

  /** O caminho no disco vem do banco: a resposta da API não o leva mais (revisão do SN-59). */
  async obterCaminhoArquivo(osId: string, anexoId: string, solicitante?: Solicitante): Promise<string> {
    const os = await this.osVisivel(osId, solicitante);
    const anexo = await this.anexoDaOS(os.id, anexoId);

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

    const extensao = extensaoDe(file.originalname);
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
}

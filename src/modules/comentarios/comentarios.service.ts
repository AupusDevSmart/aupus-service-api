import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService, type ScopedUser } from '@/core';
import { PAPEIS_DA_EQUIPE } from '@/core/modules/permissions/matriz-de-permissoes';
import type { Evento } from '../notificacoes/catalogo';
import { registrarNotificacao } from '../notificacoes/registrar-notificacao';

/** Onde se comenta (SN-48): os nomes são os do escopo e do catálogo de notificações. */
export type AlvoDoComentario = 'ordem_servico' | 'solicitacao_servico';

/** Quem escreveu edita ou exclui por este tempo depois de comentar. */
export const PRAZO_DE_EDICAO_MS = 15 * 60_000;

/** Teto da lista: uma OS com milhares de comentários não volta inteira. */
const MAXIMO_NA_LISTA = 500;

export interface ComentarioDoRegistro {
  id: string;
  comentario: string;
  autor: string;
  autor_id: string | null;
  /** Interno: só a equipe vê. */
  interno: boolean;
  created_at: Date;
  updated_at: Date;
  editado: boolean;
  /** Até quando quem está vendo pode editar ou excluir; null se não pode (não é dele ou passou). */
  editavel_ate: Date | null;
  /** Quanto falta para o prazo, medido no servidor (o relógio do aparelho pode estar errado). */
  editavel_por_ms: number | null;
}

interface LinhaDoComentario {
  id: string;
  comentario: string;
  autor: string;
  autor_id: string | null;
  privado: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Vê e escreve interno só quem é da equipe (lista de quem pode, tirada da
 * matriz): conta sem papel, papel legado ou fora da matriz fica de fora. A
 * regra "não é proprietario" deixava passar quem não tem papel nenhum.
 */
const EQUIPE = new Set(PAPEIS_DA_EQUIPE);
const ehDaEquipe = (user?: ScopedUser) => !!user?.role && EQUIPE.has(user.role);
const mesmoId = (a?: string | null, b?: string | null) => !!a && !!b && a.trim() === b.trim();

const EVENTO: Record<AlvoDoComentario, { publico: Evento; interno: Evento }> = {
  ordem_servico: { publico: 'os.comentario', interno: 'os.comentario_interno' },
  solicitacao_servico: { publico: 'solicitacao.comentario', interno: 'solicitacao.comentario_interno' },
};

/**
 * Comentários da OS e da solicitação (SN-48), um serviço para as duas tabelas
 * (iguais coluna por coluna; `privado` é o interno).
 *
 * - Lê quem enxerga o registro pelo escopo da planta; de outra planta ou
 *   inexistente, 404 (nem confirma que existe). Quem não é da equipe não vê o
 *   interno, nem para editar: para ele, não existe.
 * - Escreve quem a rota deixa (a permissão de atuar está no controller); só a
 *   equipe escreve interno.
 * - Editar e excluir: só o próprio, por 15 minutos, conferido na própria
 *   gravação (duas abas não editam um comentário já excluído). Excluir é lógico.
 * - Comentário novo avisa os envolvidos, na mesma transação; o interno vai por
 *   outro evento, que só avisa a equipe.
 */
@Injectable()
export class ComentariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: PermissionScopeService,
  ) {}

  async listar(alvo: AlvoDoComentario, registroId: string, user: ScopedUser): Promise<ComentarioDoRegistro[]> {
    const id = await this.garantirRegistro(alvo, registroId, user);
    const filtro = { deleted_at: null, ...(ehDaEquipe(user) ? {} : { privado: false }) };
    const ordem = [{ created_at: 'asc' as const }, { id: 'asc' as const }];
    const linhas: LinhaDoComentario[] =
      alvo === 'ordem_servico'
        ? await this.prisma.comentarios_os.findMany({ where: { os_id: id, ...filtro }, orderBy: ordem, take: MAXIMO_NA_LISTA })
        : await this.prisma.comentarios_solicitacao_servico.findMany({ where: { solicitacao_id: id, ...filtro }, orderBy: ordem, take: MAXIMO_NA_LISTA });
    return linhas.map((l) => this.paraResposta(l, user));
  }

  async comentar(
    alvo: AlvoDoComentario,
    registroId: string,
    dados: { comentario: string; interno?: boolean },
    user: ScopedUser & { id: string },
  ): Promise<ComentarioDoRegistro> {
    const id = await this.garantirRegistro(alvo, registroId, user);
    const interno = dados.interno === true;
    if (interno && !ehDaEquipe(user)) throw new ForbiddenException('Comentário interno é só da equipe');

    const autorId = user.id.trim();
    const autor = (await this.prisma.usuarios.findUnique({ where: { id: autorId }, select: { nome: true } }))?.nome ?? 'Usuário';
    const texto = dados.comentario.trim();

    const criado = await this.prisma.$transaction(async (tx) => {
      const base = { comentario: texto, autor, autor_id: autorId, privado: interno };
      const linha: LinhaDoComentario =
        alvo === 'ordem_servico'
          ? await tx.comentarios_os.create({ data: { ...base, os_id: id } })
          : await tx.comentarios_solicitacao_servico.create({ data: { ...base, solicitacao_id: id } });
      await registrarNotificacao(tx, {
        evento: interno ? EVENTO[alvo].interno : EVENTO[alvo].publico,
        entidade: alvo,
        entidadeId: id,
        atorId: autorId,
      });
      return linha;
    });
    return this.paraResposta(criado, user);
  }

  async editar(
    alvo: AlvoDoComentario,
    registroId: string,
    comentarioId: string,
    dados: { comentario: string },
    user: ScopedUser & { id: string },
  ): Promise<ComentarioDoRegistro> {
    const id = await this.garantirRegistro(alvo, registroId, user);
    await this.garantirQuePodeMexer(alvo, id, comentarioId, user);
    await this.gravarSeAindaPode(alvo, id, comentarioId, user, { comentario: dados.comentario.trim(), updated_at: new Date() });
    const linha: LinhaDoComentario | null =
      alvo === 'ordem_servico'
        ? await this.prisma.comentarios_os.findFirst({ where: { id: comentarioId.trim() } })
        : await this.prisma.comentarios_solicitacao_servico.findFirst({ where: { id: comentarioId.trim() } });
    if (!linha) throw new NotFoundException('Comentário não encontrado');
    return this.paraResposta(linha, user);
  }

  async excluir(alvo: AlvoDoComentario, registroId: string, comentarioId: string, user: ScopedUser & { id: string }): Promise<void> {
    const id = await this.garantirRegistro(alvo, registroId, user);
    await this.garantirQuePodeMexer(alvo, id, comentarioId, user);
    await this.gravarSeAindaPode(alvo, id, comentarioId, user, { deleted_at: new Date() });
  }

  /**
   * O id do registro, aparado, se ele existe e está no escopo de quem pede.
   * De outra planta também é 404: a resposta não confirma que o registro existe.
   */
  private async garantirRegistro(alvo: AlvoDoComentario, registroId: string, user: ScopedUser): Promise<string> {
    const id = registroId?.trim();
    const naoEncontrado = () => new NotFoundException(alvo === 'ordem_servico' ? 'OS não encontrada' : 'Solicitação não encontrada');
    if (!id) throw naoEncontrado();
    await this.escopo.assertEntityInScope(alvo, id, user).catch((erro: unknown) => {
      throw erro instanceof ForbiddenException ? naoEncontrado() : erro;
    });
    // Quem não tem escopo (gerente, admin) passa direto pelo assert: a existência é conferida aqui
    const existe =
      alvo === 'ordem_servico'
        ? await this.prisma.ordens_servico.findFirst({ where: { id, deletado_em: null }, select: { id: true } })
        : await this.prisma.solicitacoes_servico.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
    if (!existe) throw naoEncontrado();
    return id;
  }

  /** Diz por que não pode (404, 403, 409); a gravação confere de novo, no mesmo comando. */
  private async garantirQuePodeMexer(alvo: AlvoDoComentario, registroId: string, comentarioId: string, user: ScopedUser & { id: string }) {
    const where = { id: comentarioId?.trim() ?? '', deleted_at: null };
    const linha: LinhaDoComentario | null =
      alvo === 'ordem_servico'
        ? await this.prisma.comentarios_os.findFirst({ where: { ...where, os_id: registroId } })
        : await this.prisma.comentarios_solicitacao_servico.findFirst({ where: { ...where, solicitacao_id: registroId } });
    // O interno não existe para quem não é da equipe
    if (!linha || (linha.privado && !ehDaEquipe(user))) throw new NotFoundException('Comentário não encontrado');
    if (!mesmoId(linha.autor_id, user.id)) throw new ForbiddenException('Só quem escreveu o comentário pode mudá-lo');
    if (Date.now() - linha.created_at.getTime() > PRAZO_DE_EDICAO_MS) {
      throw new ConflictException('O comentário só pode ser editado ou excluído até 15 minutos depois de escrito');
    }
  }

  /**
   * Grava só se o comentário ainda é do usuário, não foi excluído e está no
   * prazo — na mesma instrução: com duas abas, editar e excluir juntos não
   * deixam um comentário excluído com o texto trocado.
   */
  private async gravarSeAindaPode(
    alvo: AlvoDoComentario,
    registroId: string,
    comentarioId: string,
    user: ScopedUser & { id: string },
    data: { comentario?: string; updated_at?: Date; deleted_at?: Date },
  ): Promise<void> {
    const where = {
      id: comentarioId.trim(),
      deleted_at: null,
      autor_id: user.id.trim(),
      created_at: { gte: new Date(Date.now() - PRAZO_DE_EDICAO_MS) },
    };
    const { count } =
      alvo === 'ordem_servico'
        ? await this.prisma.comentarios_os.updateMany({ where: { ...where, os_id: registroId }, data })
        : await this.prisma.comentarios_solicitacao_servico.updateMany({ where: { ...where, solicitacao_id: registroId }, data });
    if (count === 0) throw new ConflictException('O comentário mudou enquanto isso (excluído ou fora do prazo): recarregue');
  }

  private paraResposta(l: LinhaDoComentario, user: ScopedUser): ComentarioDoRegistro {
    const limite = new Date(l.created_at.getTime() + PRAZO_DE_EDICAO_MS);
    const falta = limite.getTime() - Date.now();
    const podeMudar = mesmoId(l.autor_id, user.id) && falta > 0;
    return {
      id: l.id.trim(),
      comentario: l.comentario,
      autor: l.autor,
      autor_id: l.autor_id?.trim() || null,
      interno: l.privado,
      created_at: l.created_at,
      updated_at: l.updated_at,
      // O create grava os dois com o mesmo instante; editar muda o updated_at
      editado: l.updated_at.getTime() - l.created_at.getTime() > 1000,
      editavel_ate: podeMudar ? limite : null,
      editavel_por_ms: podeMudar ? falta : null,
    };
  }
}

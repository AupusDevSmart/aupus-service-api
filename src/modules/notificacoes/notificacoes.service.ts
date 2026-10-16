import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { PAPEIS_DA_EQUIPE } from '@/core/modules/permissions/matriz-de-permissoes';
import { EVENTOS, ehEvento, type Evento } from './catalogo';

/** Evento que só avisa a equipe (o comentário interno) nem aparece nas preferências de quem não é dela. */
const visivelPara = (evento: Evento, papel?: string | null) =>
  !('soEquipe' in EVENTOS[evento] && EVENTOS[evento].soEquipe) || (!!papel && PAPEIS_DA_EQUIPE.includes(papel));

export interface PreferenciaDeNotificacao {
  evento: Evento;
  grupo: string;
  nome: string;
  /** O evento pede ação: o e-mail vem ligado por padrão. */
  acao: boolean;
  email: boolean;
}

/**
 * As notificações de quem está logado (SN-47). Toda consulta filtra pelo
 * usuário: ninguém vê nem marca a de outro (id de outro = "não existe").
 */
@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(usuarioId: string, filtro: { somenteNaoLidas?: boolean; page?: number; limit?: number }) {
    const limit = Math.min(Math.max(filtro.limit ?? 20, 1), 50);
    const page = Math.max(filtro.page ?? 1, 1);
    const where = { usuario_id: usuarioId.trim(), ...(filtro.somenteNaoLidas ? { lida: false } : {}) };
    const [data, total, naoLidas] = await Promise.all([
      this.prisma.notificacoes.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, titulo: true, descricao: true, tipo: true, link: true, lida: true, evento: true, created_at: true },
      }),
      this.prisma.notificacoes.count({ where }),
      // Só as não lidas: o total já é a contagem
      filtro.somenteNaoLidas ? null : this.contarNaoLidas(usuarioId),
    ]);
    return { data, pagination: { page, limit, total }, naoLidas: naoLidas ?? total };
  }

  contarNaoLidas(usuarioId: string): Promise<number> {
    return this.prisma.notificacoes.count({ where: { usuario_id: usuarioId.trim(), lida: false } });
  }

  async marcarLida(usuarioId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notificacoes.updateMany({
      where: { id: id.trim(), usuario_id: usuarioId.trim() },
      data: { lida: true, lida_em: new Date(), updated_at: new Date() },
    });
    if (count === 0) throw new NotFoundException('Notificação não encontrada');
  }

  async marcarTodasLidas(usuarioId: string): Promise<number> {
    const { count } = await this.prisma.notificacoes.updateMany({
      where: { usuario_id: usuarioId.trim(), lida: false },
      data: { lida: true, lida_em: new Date(), updated_at: new Date() },
    });
    return count;
  }

  /** Cada evento do catálogo com o que a pessoa escolheu para o e-mail (sem escolha, o padrão). */
  async preferencias(usuarioId: string, papel?: string | null): Promise<PreferenciaDeNotificacao[]> {
    const salvas = await this.prisma.notificacoes_preferencias.findMany({ where: { usuario_id: usuarioId.trim(), canal: 'email' } });
    const escolha = new Map(salvas.map((p) => [p.evento, p.ativo]));
    return (Object.keys(EVENTOS) as Evento[]).filter((evento) => visivelPara(evento, papel)).map((evento) => {
      const d = EVENTOS[evento];
      return { evento, grupo: d.grupo, nome: d.nome, acao: d.acao, email: escolha.get(evento) ?? d.acao };
    });
  }

  async salvarPreferencias(
    usuarioId: string,
    escolhas: { evento: string; email: boolean }[],
    papel?: string | null,
  ): Promise<PreferenciaDeNotificacao[]> {
    const desconhecido = escolhas.find((e) => !ehEvento(e.evento));
    if (desconhecido) throw new BadRequestException(`Evento desconhecido: ${desconhecido.evento}`);
    const id = usuarioId.trim();
    await this.prisma.$transaction(
      escolhas.map((e) =>
        this.prisma.notificacoes_preferencias.upsert({
          where: { usuario_id_evento_canal: { usuario_id: id, evento: e.evento, canal: 'email' } },
          update: { ativo: e.email, atualizado_em: new Date() },
          create: { usuario_id: id, evento: e.evento, canal: 'email', ativo: e.email, atualizado_em: new Date() },
        }),
      ),
    );
    return this.preferencias(id, papel);
  }
}

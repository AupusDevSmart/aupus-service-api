import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { Prisma, type notificacoes_eventos } from '@prisma/client';
import { PrismaService } from '@/core';
import { EVENTOS, ehEvento } from './catalogo';
import { destinatarios, lerRegistro } from './registro-da-notificacao';

const LOTE = 100;
const LOTES_POR_RODADA = 10;

/** Banco fora do ar, conexão caída, transação vencida, conflito: tentar de novo resolve. */
const PASSAGEIROS = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034']);

function ehPassageiro(erro: unknown): boolean {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) return PASSAGEIROS.has(erro.code);
  return erro instanceof Prisma.PrismaClientInitializationError;
}

/**
 * Transforma os eventos gravados (registrarNotificacao) em avisos (SN-47): lê
 * o registro, decide quem recebe pelo catálogo e grava, numa transação por
 * evento, a notificação de cada um e o e-mail na fila quando a pessoa quer
 * (preferência; sem ela, o padrão do evento). Roda a cada 15 s.
 *
 * - A transação começa reivindicando o evento (`processado_em` nulo → agora):
 *   um segundo processo com o mesmo banco (script que sobe o AppModule) espera
 *   o lock e encontra o evento já tratado, sem duplicar aviso nem e-mail.
 * - Erro passageiro (banco, conexão, transação vencida) deixa o evento
 *   pendente para a próxima rodada. Erro permanente (registro apagado, evento
 *   desconhecido, defeito) fica processado COM o erro gravado e no log: não
 *   trava a fila nem repete para sempre, e não some calado.
 */
@Injectable()
export class ProcessadorDeNotificacoes {
  private readonly logger = new Logger(ProcessadorDeNotificacoes.name);
  private rodando = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval(15_000)
  async aCada15Segundos(): Promise<void> {
    await this.processarPendentes().catch((e: unknown) => this.logger.error(`falha ao processar notificações: ${String(e)}`));
  }

  /** Processa o que está pendente, do mais antigo ao mais novo. Devolve quantos eventos tratou. */
  async processarPendentes(): Promise<number> {
    if (this.rodando) return 0;
    this.rodando = true;
    let tratados = 0;
    // O cursor anda mesmo quando um evento fica pendente (erro passageiro): ele
    // não segura os que vêm depois nesta rodada
    let depoisDe = BigInt(0);
    try {
      for (let lote = 0; lote < LOTES_POR_RODADA; lote++) {
        const eventos = await this.prisma.notificacoes_eventos.findMany({
          where: { processado_em: null, id: { gt: depoisDe } },
          orderBy: { id: 'asc' },
          take: LOTE,
        });
        for (const evento of eventos) await this.processar(evento);
        tratados += eventos.length;
        if (eventos.length < LOTE) break;
        depoisDe = eventos[eventos.length - 1].id;
      }
      return tratados;
    } finally {
      this.rodando = false;
    }
  }

  private async processar(evento: notificacoes_eventos): Promise<void> {
    try {
      const avisos = await this.avisos(evento);
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.notificacoes_eventos.updateMany({
          where: { id: evento.id, processado_em: null },
          data: { processado_em: new Date() },
        });
        if (count === 0) return;
        if (avisos.length === 0) return;

        const agora = new Date();
        // TIMESTAMP(0) arredonda: 12:00:00.6 viraria 12:00:01, e a fila
        // (proxima_tentativa <= agora) só pegaria o envio no segundo seguinte
        const jaVale = new Date(Math.floor(agora.getTime() / 1000) * 1000);
        await tx.notificacoes.createMany({ data: avisos.map((a) => ({ ...a.notificacao, created_at: agora, updated_at: agora })) });
        const porEmail = avisos.filter((a) => a.email);
        if (porEmail.length > 0) {
          await tx.notificacoes_envios.createMany({
            data: porEmail.map((a) => ({
              notificacao_id: a.notificacao.id, canal: 'email', destino: a.email as string, proxima_tentativa: jaVale, criado_em: agora,
            })),
          });
        }
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      const qual = `evento ${evento.id} (${evento.evento} ${evento.entidade} ${evento.entidade_id})`;
      if (ehPassageiro(erro)) {
        this.logger.warn(`${qual} fica para a próxima rodada: ${motivo}`);
        return;
      }
      this.logger.error(`${qual} não virou aviso: ${motivo}`);
      await this.prisma.notificacoes_eventos.updateMany({
        where: { id: evento.id, processado_em: null },
        data: { processado_em: new Date(), erro: motivo },
      });
    }
  }

  private async avisos(evento: notificacoes_eventos) {
    if (!ehEvento(evento.evento)) throw new Error(`evento desconhecido: ${evento.evento}`);
    const definicao = EVENTOS[evento.evento];
    const registro = await lerRegistro(this.prisma, evento.entidade, evento.entidade_id);
    if (!registro) throw new Error('o registro não existe mais');

    const quem = await destinatarios(this.prisma, {
      permissao: 'permissao' in definicao ? definicao.permissao : undefined,
      envolvidos: definicao.envolvidos.flatMap((papel) => registro.pessoas[papel]),
      plantaId: registro.plantaId,
      atorId: evento.ator_id,
    });
    if (quem.length === 0) return [];

    const preferencias = await this.prisma.notificacoes_preferencias.findMany({
      where: { usuario_id: { in: quem.map((q) => q.id) }, evento: evento.evento, canal: 'email' },
    });
    const querEmail = new Map(preferencias.map((p) => [p.usuario_id.trim(), p.ativo]));
    const nota = 'nota' in definicao ? definicao.nota : undefined;
    const descricao = [registro.resumo, nota].filter(Boolean).join(' ');

    return quem.map((q) => ({
      notificacao: {
        id: randomBytes(13).toString('hex'),
        usuario_id: q.id,
        titulo: definicao.titulo(registro).slice(0, 255),
        descricao,
        tipo: definicao.acao ? 'acao' : 'info',
        link: registro.link,
        evento: evento.evento,
        entidade: registro.entidade,
        entidade_id: registro.id,
        planta_id: registro.plantaId,
      },
      email: (querEmail.get(q.id) ?? definicao.acao) && q.email && !q.email.startsWith('deleted_') ? q.email : null,
    }));
  }
}

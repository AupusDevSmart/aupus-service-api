import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { variantesDeIds } from '../tarefas/ids';
import { totalDaLinha } from './conta-da-proposta';
import { padroesDaLogistica } from './padroes-da-proposta';
import {
  CHAVES_AUTOMATICAS,
  linhasAutomaticas,
  planejamentoCalculado,
  planoDaSincronizacao,
  type PadroesDaLogistica,
  type PlanejamentoCalculado,
} from './planejamento-da-proposta';

type Db = Pick<Prisma.TransactionClient, 'solicitacoes_servico' | 'solicitacoes_itens' | 'sub_instrucoes' | 'padroes_da_proposta' | 'solicitacoes_logistica'>;

/** Os tetos das colunas da linha: km Decimal(10, 2), quantidade Decimal(10, 3), total Decimal(14, 2) */
const TETO_DO_KM = 99_999_999.99;
const TETO_DA_QUANTIDADE = 9_999_999.999;
const TETO_DO_TOTAL = 999_999_999_999.99;

const numero = (valor: Prisma.Decimal | number | null | undefined): number | null => {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
  return Number.isFinite(n) ? n : null;
};

/**
 * As horas dos passos das instruções DA PROPOSTA (as linhas dos itens), e não
 * dos vínculos da solicitação: a tela grava a linha antes do vínculo (que só vai
 * no PATCH, sem recálculo), e é a linha que a revisão confere. Pelas duas formas
 * do id: `sub_instrucoes.instrucao_id` é Char(26), e o cuid antigo de 25
 * caracteres não casava (as horas saíam zero, calado).
 */
async function horasDosPassos(db: Db, solicitacaoId: string): Promise<{ total: number; porInstrucao: { descricao: string; horas: number }[] }> {
  const itens = await db.solicitacoes_itens.findMany({
    where: { solicitacao_id: solicitacaoId, instrucao_id: { not: null }, recurso_id: null },
    select: { instrucao_id: true, descricao: true },
    orderBy: { ordem: 'asc' },
  });
  const ids = variantesDeIds(itens.map((i) => i.instrucao_id ?? ''));
  if (!ids.length) return { total: 0, porInstrucao: [] };
  // Por instrução (a tela detalha a duração): as horas de cada uma pelo id aparado
  const somas = await db.sub_instrucoes.groupBy({ by: ['instrucao_id'], where: { instrucao_id: { in: ids } }, _sum: { duracao_horas: true } });
  const porId = new Map(somas.map((s) => [s.instrucao_id.trim(), numero(s._sum.duracao_horas) ?? 0]));
  const porInstrucao = itens
    .map((i) => ({ descricao: i.descricao, horas: porId.get((i.instrucao_id ?? '').trim()) ?? 0 }))
    .filter((i) => i.horas > 0);
  return { total: Math.round(porInstrucao.reduce((s, i) => s + i.horas, 0) * 100) / 100, porInstrucao };
}

/**
 * O planejamento da solicitação com o que se calcula dele (30/out/2026): o
 * digitado, as horas dos passos das instruções da proposta e os padrões de hoje.
 */
export async function planejamentoDaSolicitacao(
  db: Db,
  solicitacaoId: string,
): Promise<{ calculado: PlanejamentoCalculado; padroes: PadroesDaLogistica; automatica: boolean; horasPorInstrucao: { descricao: string; horas: number }[] }> {
  const [solicitacao, horas, padroes] = await Promise.all([
    db.solicitacoes_servico.findFirst({
      where: { id: solicitacaoId },
      select: { distancia_km: true, deslocamento_interno_km: true, dias_previstos: true, pessoas_previstas: true, noites_fora: true, logistica_automatica: true },
    }),
    horasDosPassos(db, solicitacaoId),
    padroesDaLogistica(db),
  ]);
  const calculado = planejamentoCalculado(
    {
      idaKm: numero(solicitacao?.distancia_km),
      internoKm: numero(solicitacao?.deslocamento_interno_km),
      dias: numero(solicitacao?.dias_previstos),
      pessoas: solicitacao?.pessoas_previstas ?? null,
      noites: solicitacao?.noites_fora ?? null,
      horasDosPassos: horas.total,
    },
    padroes,
  );
  return { calculado, padroes, automatica: solicitacao?.logistica_automatica ?? true, horasPorInstrucao: horas.porInstrucao };
}

/** O que passa da coluna é 400 com o motivo (o banco recusaria com 500) */
function dentroDosTetos(linha: { quantidade: number | null; km: number | null; total: number }): void {
  if ((linha.km ?? 0) > TETO_DO_KM || (linha.quantidade ?? 0) > TETO_DA_QUANTIDADE || linha.total > TETO_DO_TOTAL) {
    throw new BadRequestException('A logística calculada passa do que se guarda: confira a distância, o interno, os dias e as pessoas.');
  }
}

/**
 * Põe as linhas automáticas da logística em dia com o planejamento (dentro da
 * transação da escrita, antes da conta): cria as que faltam e acerta as
 * quantidades das que acompanham (a que o planejamento não pede mais fica com
 * zero). A ajustada à mão fica como a pessoa deixou. Na solicitação com a
 * logística digitada (`logistica_automatica` desligada), não mexe em nada.
 * Devolve se algo mudou.
 */
export async function sincronizarLogistica(db: Db, solicitacaoId: string): Promise<boolean> {
  const [{ calculado, padroes, automatica }, gravadas] = await Promise.all([
    planejamentoDaSolicitacao(db, solicitacaoId),
    db.solicitacoes_logistica.findMany({ where: { solicitacao_id: solicitacaoId } }),
  ]);
  if (!automatica) return false;
  const plano = planoDaSincronizacao(
    gravadas.map((g) => ({ id: g.id, automatica: g.automatica, ajustada: g.ajustada, ativo: g.ativo, quantidade: numero(g.quantidade), km: numero(g.km) })),
    linhasAutomaticas(calculado, padroes),
  );

  if (plano.apagar.length > 0) await db.solicitacoes_logistica.deleteMany({ where: { id: { in: plano.apagar } } });

  for (const { id, quantidade, km } of plano.atualizar) {
    const g = gravadas.find((linha) => linha.id === id)!;
    const total = totalDaLinha({
      tabela: g.tabela,
      quantidade,
      km,
      dias: numero(g.dias),
      valor_unitario: numero(g.valor_unitario),
      valor_km: numero(g.valor_km),
      valor_fixo: numero(g.valor_fixo),
    });
    dentroDosTetos({ quantidade, km, total });
    await db.solicitacoes_logistica.update({ where: { id }, data: { quantidade, km, total } });
  }

  if (plano.criar.length > 0) {
    // Depois das digitadas de cada tabela, na ordem das chaves (café, almoço, jantar, pernoite)
    const proxima = new Map<string, number>();
    for (const g of gravadas) proxima.set(g.tabela, Math.max(proxima.get(g.tabela) ?? 0, g.ordem));
    const ordenadas = [...plano.criar].sort((a, b) => CHAVES_AUTOMATICAS.indexOf(a.chave) - CHAVES_AUTOMATICAS.indexOf(b.chave));
    await db.solicitacoes_logistica.createMany({
      data: ordenadas.map((l) => {
        const total = totalDaLinha(l);
        dentroDosTetos({ quantidade: l.quantidade, km: l.km, total });
        const ordem = (proxima.get(l.tabela) ?? 0) + 1;
        proxima.set(l.tabela, ordem);
        return {
          solicitacao_id: solicitacaoId,
          tabela: l.tabela,
          ativo: true,
          descricao: l.descricao,
          quantidade: l.quantidade,
          km: l.km,
          valor_unitario: l.valor_unitario,
          valor_km: l.valor_km,
          total,
          automatica: l.chave,
          ajustada: false,
          ordem,
        };
      }),
    });
  }
  return plano.criar.length + plano.atualizar.length + plano.apagar.length > 0;
}

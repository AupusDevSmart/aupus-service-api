import type { Prisma } from '@prisma/client';
import type { PercentuaisDaProposta } from './conta-da-proposta';

/** Os números de simulação da spec (29/out/2026), usados sem a linha no banco; confirmar na tela */
export const PADROES_DA_SPEC: PercentuaisDaProposta = { imposto: 15, margem: 20, admServicos: 5, admFd: 2 };

const numero = (valor: Prisma.Decimal | number | null | undefined): number => {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Os percentuais gravados numa linha (a solicitação ou os padrões), em número */
export function percentuaisDe(linha: {
  imposto_percentual?: Prisma.Decimal | number | null;
  margem_percentual?: Prisma.Decimal | number | null;
  adm_servicos_percentual?: Prisma.Decimal | number | null;
  adm_fd_percentual?: Prisma.Decimal | number | null;
}): PercentuaisDaProposta {
  return {
    imposto: numero(linha.imposto_percentual),
    margem: numero(linha.margem_percentual),
    admServicos: numero(linha.adm_servicos_percentual),
    admFd: numero(linha.adm_fd_percentual),
  };
}

/** As colunas da solicitação com os percentuais (para copiar os padrões nela) */
export const colunasDosPercentuais = (p: PercentuaisDaProposta) => ({
  imposto_percentual: p.imposto,
  margem_percentual: p.margem,
  adm_servicos_percentual: p.admServicos,
  adm_fd_percentual: p.admFd,
});

/**
 * Os percentuais padrão da proposta (29/out/2026): o que a solicitação nova copia.
 * Sem a linha (apagada à mão), os da spec. Sem a TABELA é erro: no deploy, o SQL
 * `2026-10-29-proposta-imposto-e-margem.sql` vai antes da API nova.
 */
export async function padroesDaProposta(prisma: Pick<Prisma.TransactionClient, 'padroes_da_proposta'>): Promise<PercentuaisDaProposta> {
  const linha = await prisma.padroes_da_proposta.findUnique({ where: { id: 1 } });
  return linha ? percentuaisDe(linha) : { ...PADROES_DA_SPEC };
}

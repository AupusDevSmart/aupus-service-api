import type { Prisma } from '@prisma/client';
import type { NaturezaDoOutroCusto } from '../execucao-os/natureza-do-custo';
import { variantesDeIds } from '../tarefas/ids';
import { linhaDeLogisticaLida } from './recalculo-da-proposta';

/**
 * O que a programação herda da proposta revisada (29/out/2026): a proposta é
 * feita com o que a OS já tem, e programar não pede para digitar de novo.
 *
 * - as instruções vêm sozinhas (`instrucoesDaOrigem`, na criação da programação);
 *   daqui vai o VALOR de cada uma na proposta (o custo combinado, não o do
 *   cadastro de hoje), como ajuste da programação (SN-93);
 * - o frete, o deslocamento e as diárias ativos viram os outros custos previstos,
 *   com a natureza da OS: o técnico confere as diárias (despesas de campo) e não vê
 *   o resto, como em toda OS;
 * - os custos adicionais da Aupus, e as linhas avulsas, também; o faturamento
 *   direto não, porque o cliente o paga ao fornecedor e não é custo da OS;
 * - com deslocamento, a programação já nasce pedindo veículo.
 *
 * Os valores são CUSTO: a venda (com imposto e margem) é da proposta, e a OS
 * acompanha o previsto contra o realizado.
 */

/** De cada tabela da proposta, a natureza do custo na OS (SN-93) */
const NATUREZA_DA_TABELA: Record<string, NaturezaDoOutroCusto> = {
  FRETE: 'TERCEIRO',
  DESLOCAMENTO: 'VEICULO',
  DIARIA: 'DESPESA_CAMPO',
};

export interface HerancaDaProposta {
  valores_das_instrucoes: { instrucao_id: string; valor: number }[];
  itens_orcamento: { descricao: string; valor: number; natureza: NaturezaDoOutroCusto }[];
  necessita_veiculo: boolean;
  /** As linhas de instrução da proposta cuja instrução não está mais vinculada (ou foi excluída): ficam de fora */
  sem_vinculo: string[];
  /** O planejamento da proposta, para a tela mostrar ao escalar a equipe */
  dias_previstos: number | null;
  pessoas_previstas: number | null;
}

type Leitor = Pick<Prisma.TransactionClient, 'solicitacoes_instrucoes' | 'solicitacoes_itens' | 'solicitacoes_outros_custos' | 'solicitacoes_logistica' | 'solicitacoes_servico'>;

const numero = (valor: Prisma.Decimal | number | null | undefined): number => {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
  return Number.isFinite(n) ? n : 0;
};
const centavos = (valor: number) => Math.round(valor * 100) / 100;

export async function herancaDaProposta(db: Leitor, solicitacaoId: string): Promise<HerancaDaProposta> {
  const ids = variantesDeIds([solicitacaoId]);
  const [vinculos, itens, outros, logistica, solicitacao] = await Promise.all([
    // As instruções que a programação recebe da origem (a excluída fica de fora, como lá)
    db.solicitacoes_instrucoes.findMany({ where: { solicitacao_id: { in: ids }, instrucao: { deleted_at: null } }, select: { instrucao_id: true } }),
    db.solicitacoes_itens.findMany({ where: { solicitacao_id: { in: ids } }, orderBy: { ordem: 'asc' } }),
    db.solicitacoes_outros_custos.findMany({ where: { solicitacao_id: { in: ids } }, orderBy: { ordem: 'asc' } }),
    db.solicitacoes_logistica.findMany({ where: { solicitacao_id: { in: ids } }, orderBy: [{ tabela: 'asc' }, { ordem: 'asc' }] }),
    db.solicitacoes_servico.findFirst({ where: { id: { in: ids } }, select: { dias_previstos: true, pessoas_previstas: true } }),
  ]);
  const daOrigem = new Set(vinculos.map((v) => v.instrucao_id.trim()));

  // O valor de cada instrução na proposta; a linha de instrução que saiu da solicitação não tem para onde ir
  const porInstrucao = new Map<string, number>();
  const avulsos: HerancaDaProposta['itens_orcamento'] = [];
  const semVinculo: string[] = [];
  for (const item of itens) {
    const valor = centavos(numero(item.quantidade) * numero(item.preco_unitario));
    const instrucao = item.instrucao_id?.trim();
    if (instrucao) {
      if (daOrigem.has(instrucao)) porInstrucao.set(instrucao, centavos((porInstrucao.get(instrucao) ?? 0) + valor));
      else semVinculo.push(item.descricao.trim());
    } else if (valor > 0) {
      avulsos.push({ descricao: item.descricao.trim(), valor, natureza: 'OUTRO' });
    }
  }

  const ativas = logistica.map(linhaDeLogisticaLida).filter((l) => l.ativo);
  const daLogistica = ativas
    .filter((l) => l.total > 0)
    .map((l) => ({ descricao: l.descricao.trim(), valor: l.total, natureza: NATUREZA_DA_TABELA[l.tabela] ?? 'OUTRO' }));
  const adicionais = outros
    .filter((o) => !o.faturamento_direto && numero(o.valor) > 0)
    .map((o) => ({ descricao: o.descricao.trim(), valor: centavos(numero(o.valor)), natureza: 'OUTRO' as const }));

  return {
    valores_das_instrucoes: [...porInstrucao].map(([instrucao_id, valor]) => ({ instrucao_id, valor })),
    itens_orcamento: [...avulsos, ...daLogistica, ...adicionais],
    necessita_veiculo: ativas.some((l) => l.tabela === 'DESLOCAMENTO'),
    sem_vinculo: semVinculo,
    dias_previstos: solicitacao?.dias_previstos === null || solicitacao?.dias_previstos === undefined ? null : numero(solicitacao.dias_previstos),
    pessoas_previstas: solicitacao?.pessoas_previstas ?? null,
  };
}

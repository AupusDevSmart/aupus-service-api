import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { contaDaProposta, type ContaDaProposta } from './conta-da-proposta';
import { colunasDosPercentuais, padroesDaProposta, percentuaisDe } from './padroes-da-proposta';
import { sincronizarLogistica } from './logistica-automatica';

type Db = Prisma.TransactionClient;

/** Os tetos das colunas: os totais Decimal(14, 2), a margem efetiva Decimal(7, 3) */
const TETO_DO_TOTAL = 999_999_999_999.99;
const TETO_DA_MARGEM = 9_999.999;

const numero = (valor: Prisma.Decimal | number | null | undefined): number => {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
  return Number.isFinite(n) ? n : 0;
};
const ouNulo = (valor: Prisma.Decimal | number | null | undefined) => (valor === null || valor === undefined ? null : numero(valor));
const reais = (valor: number) => `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Uma linha de logística como a conta e a tela a leem (os Decimal em número) */
export function linhaDeLogisticaLida(l: {
  id: string;
  tabela: string;
  ativo: boolean;
  recurso_id: string | null;
  descricao: string;
  quantidade: Prisma.Decimal | null;
  valor_unitario: Prisma.Decimal | null;
  dias: Prisma.Decimal | null;
  km: Prisma.Decimal | null;
  valor_km: Prisma.Decimal | null;
  valor_fixo: Prisma.Decimal | null;
  total: Prisma.Decimal;
  automatica?: string | null;
  ajustada?: boolean;
  ordem: number;
}) {
  return {
    id: l.id.trim(),
    tabela: l.tabela,
    ativo: l.ativo,
    recurso_id: l.recurso_id?.trim() || null,
    descricao: l.descricao,
    quantidade: ouNulo(l.quantidade),
    valor_unitario: ouNulo(l.valor_unitario),
    dias: ouNulo(l.dias),
    km: ouNulo(l.km),
    valor_km: ouNulo(l.valor_km),
    valor_fixo: ouNulo(l.valor_fixo),
    total: numero(l.total),
    /** A linha que o planejamento calcula (30/out/2026) e se a pessoa a ajustou à mão */
    automatica: l.automatica?.trim() || null,
    ajustada: l.ajustada ?? false,
    ordem: l.ordem,
  };
}

/**
 * A conta da proposta como está gravada, sem gravar: a mesma da escrita, para a
 * leitura mostrar o preço de venda de cada linha. Nula na conta do BDI (as
 * propostas de antes, que ficam como documento).
 */
export async function contaGravada(db: Pick<Db, 'solicitacoes_servico' | 'solicitacoes_itens' | 'solicitacoes_outros_custos' | 'solicitacoes_logistica'>, solicitacaoId: string): Promise<ContaDaProposta | null> {
  const [solicitacao, itens, outros, logistica] = await Promise.all([
    db.solicitacoes_servico.findFirst({
      where: { id: solicitacaoId },
      select: {
        conta_da_proposta: true,
        imposto_percentual: true,
        margem_percentual: true,
        adm_servicos_percentual: true,
        adm_fd_percentual: true,
        desconto_tipo: true,
        desconto_valor: true,
      },
    }),
    db.solicitacoes_itens.findMany({ where: { solicitacao_id: solicitacaoId }, orderBy: { ordem: 'asc' }, select: { quantidade: true, preco_unitario: true } }),
    db.solicitacoes_outros_custos.findMany({ where: { solicitacao_id: solicitacaoId }, select: { valor: true, faturamento_direto: true } }),
    db.solicitacoes_logistica.findMany({ where: { solicitacao_id: solicitacaoId } }),
  ]);
  if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');
  if (solicitacao.conta_da_proposta !== 'IMPOSTO_MARGEM') return null;

  return contaDaProposta({
    instrucoes: itens.map((i) => numero(i.quantidade) * numero(i.preco_unitario)),
    logistica: logistica.map(linhaDeLogisticaLida),
    adicionais: outros.map((o) => ({ valor: numero(o.valor), faturamento_direto: o.faturamento_direto })),
    percentuais: percentuaisDe(solicitacao),
    desconto: { tipo: solicitacao.desconto_tipo, valor: ouNulo(solicitacao.desconto_valor) },
  });
}

/**
 * A proposta de antes (conta do BDI) que volta a ser editada passa para imposto e
 * margem (decisão do usuário, 29/out/2026), com os percentuais padrão. Só a
 * REGISTRADA se edita: a programada e a finalizada ficam como documento.
 *
 * Preenche só o percentual VAZIO, e também na conta já nova: o que a pessoa
 * acabou de digitar nas condições fica (antes a conversão o trocava pelo padrão,
 * calada), e a solicitação que a API antiga criou na janela do deploy (o banco
 * já dava 'IMPOSTO_MARGEM' de padrão, sem os percentuais) ganha os padrões em vez
 * de ficar com imposto e margem zero (preço igual ao custo).
 *
 * Devolve o total do BDI quando a proposta saiu dele (o histórico diz de quanto
 * para quanto), e nulo quando já estava na conta nova.
 */
async function paraAContaNova(db: Db, solicitacaoId: string): Promise<number | null> {
  const atual = await db.solicitacoes_servico.findUniqueOrThrow({
    where: { id: solicitacaoId },
    select: { conta_da_proposta: true, total_geral: true, imposto_percentual: true, margem_percentual: true, adm_servicos_percentual: true, adm_fd_percentual: true },
  });
  const vazios = (['imposto_percentual', 'margem_percentual', 'adm_servicos_percentual', 'adm_fd_percentual'] as const).filter((c) => atual[c] === null);
  if (atual.conta_da_proposta === 'IMPOSTO_MARGEM' && vazios.length === 0) return null;
  const padroes = colunasDosPercentuais(await padroesDaProposta(db));
  await db.solicitacoes_servico.update({
    where: { id: solicitacaoId },
    data: { conta_da_proposta: 'IMPOSTO_MARGEM', ...Object.fromEntries(vazios.map((c) => [c, padroes[c]])) },
  });
  return atual.conta_da_proposta === 'IMPOSTO_MARGEM' ? null : numero(atual.total_geral);
}

/**
 * Recalcula e GRAVA os totais da conta por imposto e margem. Gravar, e não
 * calcular na leitura, porque a tela, a lista e o PDF precisam do mesmo número —
 * e daqui a seis meses, mesmo que o catálogo e os padrões tenham mudado.
 */
export async function recalcularProposta(db: Db, solicitacaoId: string, { sincronizar = true }: { sincronizar?: boolean } = {}): Promise<ContaDaProposta> {
  const totalDoBdi = await paraAContaNova(db, solicitacaoId);
  // As linhas automáticas da logística seguem o planejamento (30/out/2026) antes da conta;
  // a revisão não sincroniza: fecha o que a pessoa viu
  if (sincronizar) await sincronizarLogistica(db, solicitacaoId);
  const conta = (await contaGravada(db, solicitacaoId))!;

  if (Math.max(conta.totalGeralSemDesconto, conta.custoServicos + conta.fd) > TETO_DO_TOTAL) {
    throw new BadRequestException('A proposta passa do que se guarda (total até R$ 999.999.999.999,99): confira os valores.');
  }
  const margem = conta.margemEfetiva !== null && Math.abs(conta.margemEfetiva) <= TETO_DA_MARGEM ? conta.margemEfetiva : null;
  const { desconto_tipo } = await db.solicitacoes_servico.findUniqueOrThrow({ where: { id: solicitacaoId }, select: { desconto_tipo: true } });

  await db.solicitacoes_servico.update({
    where: { id: solicitacaoId },
    data: {
      total_custo: conta.custoServicos + conta.fd,
      total_servicos: conta.custoServicos,
      total_fd: conta.fd,
      total_administracao: conta.precoAdministracao,
      total_aupus: conta.totalAupus,
      valor_imposto: conta.imposto,
      margem_efetiva: margem,
      total_geral: conta.totalGeral,
      total_desconto: desconto_tipo ? conta.desconto.aplicado : null,
      // O BDI não vale na conta nova: os nulos deixam claro que os números são os de cima
      total_bdi: null,
      bdi_percentual: null,
    },
  });
  // A troca de conta muda o total: fica no histórico, um registro só (a tela e o
  // script de conversão passam por aqui; o script gravava o seu também, e a
  // conversão de produção saiu com dois)
  if (totalDoBdi !== null) {
    await db.historico_solicitacao_servico.create({
      data: {
        solicitacao_id: solicitacaoId,
        acao: 'PROPOSTA_CONVERTIDA',
        usuario_nome: 'Sistema',
        observacoes: `Proposta passada da conta do BDI para a de imposto e margem: de ${reais(totalDoBdi)} para ${reais(conta.totalGeral)}.`,
      },
    });
  }
  return conta;
}

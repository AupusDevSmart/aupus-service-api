import { BadRequestException } from '@nestjs/common';
import type { TipoDeDesconto } from './desconto-da-proposta';

/** As tabelas de logística da proposta (29/out/2026) */
export const TABELAS_DE_LOGISTICA = ['FRETE', 'DESLOCAMENTO', 'DIARIA'] as const;
export type TabelaDeLogistica = (typeof TABELAS_DE_LOGISTICA)[number];

export interface LinhaDeLogistica {
  tabela: TabelaDeLogistica | string;
  ativo?: boolean;
  quantidade?: number | null;
  valor_unitario?: number | null;
  dias?: number | null;
  km?: number | null;
  valor_km?: number | null;
  valor_fixo?: number | null;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;
const n = (valor: number | null | undefined) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0);

/**
 * O total de uma linha de logística, pela tabela dela. Campo vazio é zero: a
 * linha ainda sendo preenchida não derruba a conta.
 *   FRETE:        km por viagem × viagens (quantidade) × R$/km + valor fixo
 *   DESLOCAMENTO: veículos (quantidade; vazio é 1) × (dias × diária do veículo + km × R$/km)
 *   DIARIA:       quantidade × valor (café, almoço, jantar, pernoite)
 * Os veículos (30/out/2026): a linha de antes não tinha a quantidade, e vazio é um veículo.
 */
export function totalDaLinha(linha: LinhaDeLogistica): number {
  if (linha.tabela === 'FRETE') return centavos(n(linha.km) * n(linha.quantidade) * n(linha.valor_km) + n(linha.valor_fixo));
  if (linha.tabela === 'DESLOCAMENTO') {
    const veiculos = linha.quantidade === null || linha.quantidade === undefined ? 1 : n(linha.quantidade);
    return centavos(veiculos * (n(linha.dias) * n(linha.valor_unitario) + n(linha.km) * n(linha.valor_km)));
  }
  return centavos(n(linha.quantidade) * n(linha.valor_unitario));
}

export interface PercentuaisDaProposta {
  imposto: number;
  margem: number;
  admServicos: number;
  admFd: number;
}

export interface EntradaDaConta {
  /** O custo de cada linha de instrução (quantidade × valor) */
  instrucoes: number[];
  logistica: LinhaDeLogistica[];
  /** Os custos adicionais; os de faturamento direto o cliente paga ao fornecedor */
  adicionais: { valor: number; faturamento_direto: boolean }[];
  percentuais: PercentuaisDaProposta;
  desconto: { tipo: TipoDeDesconto | string | null; valor: number | null };
}

export interface ContaDaProposta {
  custoInstrucoes: number;
  custoLogistica: number;
  custoAdicionais: number;
  /** O custo dos serviços da Aupus: instruções, logística e adicionais fora o FD */
  custoServicos: number;
  fd: number;
  precoServicos: number;
  /** A base da administração (adm% × custo dos serviços + adm FD% × FD) */
  administracao: number;
  /** A administração com o imposto dela (só o imposto: ela já é a remuneração da Aupus) */
  precoAdministracao: number;
  totalAupusSemDesconto: number;
  totalGeralSemDesconto: number;
  desconto: { pedido: number; aplicado: number };
  /** O faturamento da Aupus, já com o desconto */
  totalAupus: number;
  imposto: number;
  /** (total Aupus − imposto − custo dos serviços) ÷ total Aupus, em %; nulo sem faturamento */
  margemEfetiva: number | null;
  /** O investimento global: total Aupus + FD */
  totalGeral: number;
  /** O preço de venda de cada parte, repartido do preço dos serviços (soma exata) */
  venda: { instrucoes: number[]; logistica: number; adicionais: number };
}

/**
 * Reparte um total pelos pesos em centavos, e o resto do arredondamento vai para
 * as linhas de maior resto: o preço de cada linha soma exatamente o total.
 */
function repartir(total: number, pesos: number[]): number[] {
  const somaDosPesos = pesos.reduce((s, p) => s + p, 0);
  if (somaDosPesos <= 0) return pesos.map(() => 0);
  const emCentavos = Math.round(total * 100);
  const brutos = pesos.map((p) => (emCentavos * p) / somaDosPesos);
  const base = brutos.map(Math.floor);
  let falta = emCentavos - base.reduce((s, v) => s + v, 0);
  const porResto = brutos.map((b, i) => ({ i, resto: b - Math.floor(b) })).sort((a, b) => b.resto - a.resto);
  for (const { i } of porResto) {
    if (falta <= 0) break;
    base[i] += 1;
    falta -= 1;
  }
  return base.map((c) => c / 100);
}

/**
 * A conta da proposta por imposto e margem (decisão do usuário, 29/out/2026),
 * que substitui o BDI:
 *   preço dos serviços  = custo dos serviços ÷ (1 − (imposto + margem))
 *   preço da adm        = (adm% × custo dos serviços + adm FD% × FD) ÷ (1 − imposto)
 *   desconto            = % ou R$ sobre o total inteiro (Aupus + FD), abatido do
 *                         faturamento da Aupus (o FD é nota do fornecedor), até ele
 *   total Aupus         = preço dos serviços + preço da adm − desconto
 *   imposto             = imposto% × total Aupus (já com o desconto)
 *   investimento global = total Aupus + FD
 * Imposto e margem com 100% ou mais é 400: a divisão não fecha.
 */
export function contaDaProposta(entrada: EntradaDaConta): ContaDaProposta {
  const { imposto, margem, admServicos, admFd } = entrada.percentuais;
  if (imposto + margem >= 100) {
    throw new BadRequestException('O imposto e a margem somam 100% ou mais: o preço não fecha.');
  }

  const custoInstrucoes = centavos(entrada.instrucoes.reduce((s, v) => s + n(v), 0));
  const totaisDaLogistica = entrada.logistica.filter((l) => l.ativo !== false).map(totalDaLinha);
  const custoLogistica = centavos(totaisDaLogistica.reduce((s, v) => s + v, 0));
  const custoAdicionais = centavos(entrada.adicionais.filter((a) => !a.faturamento_direto).reduce((s, a) => s + n(a.valor), 0));
  const fd = centavos(entrada.adicionais.filter((a) => a.faturamento_direto).reduce((s, a) => s + n(a.valor), 0));
  const custoServicos = centavos(custoInstrucoes + custoLogistica + custoAdicionais);

  const precoServicos = centavos(custoServicos / (1 - (imposto + margem) / 100));
  const administracao = centavos((admServicos / 100) * custoServicos + (admFd / 100) * fd);
  const precoAdministracao = centavos(administracao / (1 - imposto / 100));
  const totalAupusSemDesconto = centavos(precoServicos + precoAdministracao);
  const totalGeralSemDesconto = centavos(totalAupusSemDesconto + fd);

  const { tipo, valor } = entrada.desconto;
  const pedido = !tipo || !valor || valor <= 0 ? 0 : tipo === 'PERCENTUAL' ? centavos((totalGeralSemDesconto * valor) / 100) : centavos(valor);
  const aplicado = Math.min(pedido, totalAupusSemDesconto);

  const totalAupus = centavos(totalAupusSemDesconto - aplicado);
  const valorImposto = centavos((imposto / 100) * totalAupus);
  const margemEfetiva = totalAupus > 0 ? Math.round(((totalAupus - valorImposto - custoServicos) / totalAupus) * 100 * 1000) / 1000 : null;

  const partes = repartir(precoServicos, [...entrada.instrucoes.map(n), custoLogistica, custoAdicionais]);
  const instrucoesVenda = partes.slice(0, entrada.instrucoes.length);
  const [logisticaVenda, adicionaisVenda] = partes.slice(entrada.instrucoes.length);

  return {
    custoInstrucoes,
    custoLogistica,
    custoAdicionais,
    custoServicos,
    fd,
    precoServicos,
    administracao,
    precoAdministracao,
    totalAupusSemDesconto,
    totalGeralSemDesconto,
    desconto: { pedido, aplicado },
    totalAupus,
    imposto: valorImposto,
    margemEfetiva,
    totalGeral: centavos(totalAupus + fd),
    venda: { instrucoes: instrucoesVenda, logistica: logisticaVenda, adicionais: adicionaisVenda },
  };
}

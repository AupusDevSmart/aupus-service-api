import { Prisma } from '@prisma/client';
import { emCentavos } from './horas-da-execucao';
import { NATUREZAS_DOS_OUTROS_CUSTOS, ROTULO_DA_NATUREZA, ROTULO_DO_ITEM, type NaturezaDoCusto, type NaturezaDoOutroCusto } from './natureza-do-custo';

/**
 * O custo da OS aberto (SN-93): o sheet e o PDF leem daqui, e o `custo_real`
 * gravado sai da mesma conta (`custoRealDosDados`). Decisões do usuário
 * (21/out/2026):
 *
 * - D4  o custo real é o apurado: horas × valor/hora de cada pessoa, o material
 *       consumido × custo unitário, os outros custos conferidos no Executar e os
 *       não previstos. O outro custo não conferido (OS executada antes do SN-93)
 *       entra pelo previsto, e a pendência diz;
 * - D1  as instruções aparecem com o valor de cada uma (o do cadastro no vínculo
 *       ou o ajustado na programação) e o total das feitas: o que foi entregue,
 *       ao lado do que foi gasto.
 *
 * O previsto é a mesma conta pelas horas estimadas, o material planejado e o
 * valor de cada outro custo — a do orçamento da programação. A diferença para o
 * `orcamento_previsto` gravado é o ajuste da aprovação, e aparece como tal.
 */

export interface PessoaDoCusto {
  nome: string | null;
  especialidade: string;
  horas_estimadas: number;
  horas_trabalhadas: number | null;
  custo_hora: number | null;
}

export interface MaterialDoCusto {
  descricao: string;
  unidade: string;
  quantidade_planejada: number;
  quantidade_consumida: number | null;
  custo_unitario: number | null;
}

export interface OutroCustoDoCusto {
  descricao: string;
  natureza: NaturezaDoOutroCusto;
  /** O do orçamento (0 no não previsto) */
  previsto: number;
  /** O conferido no Executar; null = não conferido */
  real: number | null;
  nao_previsto: boolean;
}

export interface InstrucaoDoCusto {
  codigo: string | null;
  nome: string | null;
  equipamento: string | null;
  status: string;
  /** O valor nesta OS; null na linha de antes do SN-93 */
  valor: number | null;
  valor_original: number | null;
  /** Na linha sem valor: o do cadastro de agora (fora do registro), para a linha não ficar em branco */
  valor_do_cadastro_hoje?: number | null;
}

export interface DadosDoCusto {
  equipe: PessoaDoCusto[];
  materiais: MaterialDoCusto[];
  outros: OutroCustoDoCusto[];
  /** O número único de antes do SN-93, sem descrição */
  custos_adicionais: number | null;
  instrucoes: InstrucaoDoCusto[];
  orcamento_previsto: number | null;
  /**
   * Falso na OS finalizada com o conteúdo da versão 1: o custo real gravado nela
   * não tinha os outros custos nem os adicionais, e o total do resumo tem de ser
   * o que o código prova. Eles aparecem, pelo previsto, fora do total.
   */
  outros_no_real: boolean;
  /**
   * O real já foi apurado (o Executar passou). Antes dele, o material sem consumo
   * é o normal, e não pendência. Padrão: apurado (o PDF só sai depois do Executar)
   */
  apurado?: boolean;
}

export type LinhaDaNatureza = NaturezaDoCusto | 'NAO_PREVISTO' | 'ADICIONAIS';

export interface ResumoDoCusto {
  /** O previsto do que entra no real (na OS finalizada antes do SN-93, só mão de obra e material) */
  previsto: number;
  real: number;
  orcamento_previsto: number | null;
  /** O orçamento gravado menos o previsto pelas linhas: o ajuste da aprovação */
  ajuste_do_orcamento: number;
  /**
   * Na OS finalizada antes do SN-93: os outros custos aparecem pelo previsto, fora
   * do total (o real deles é null). Sem isso o quadro dizia "Veículo R$ 0,00, −100%"
   * e a OS parecia ter economizado o que nunca entrou na conta.
   */
  outros_fora_do_total: boolean;
  /** `real` null: a natureza fica fora do total (ver `outros_fora_do_total`) */
  naturezas: { natureza: LinhaDaNatureza; rotulo: string; previsto: number; real: number | null }[];
  equipe: {
    nome: string;
    especialidade: string;
    horas_previstas: number;
    horas_trabalhadas: number | null;
    valor_hora: number | null;
    previsto: number;
    real: number;
  }[];
  materiais: {
    descricao: string;
    unidade: string;
    quantidade_planejada: number;
    quantidade_consumida: number | null;
    custo_unitario: number | null;
    previsto: number;
    real: number;
  }[];
  outros: {
    descricao: string;
    natureza: NaturezaDoOutroCusto;
    rotulo: string;
    previsto: number;
    real: number | null;
    /** O que entrou no real: o conferido, ou o previsto quando não foi conferido; null = fora do total */
    no_real: number | null;
    conferido: boolean;
    nao_previsto: boolean;
  }[];
  instrucoes: {
    codigo: string | null;
    nome: string | null;
    equipamento: string | null;
    status: string;
    feita: boolean;
    valor: number | null;
    valor_original: number | null;
    /** O valor nesta OS difere do cadastro no vínculo */
    ajustado: boolean;
    /** Linha de antes do SN-93: o valor é o do cadastro de agora */
    do_cadastro_hoje: boolean;
  }[];
  instrucoes_total: number;
  instrucoes_feitas: number;
  instrucoes_feitas_total: number;
  /** O que a conta não pôde fechar, para quem lê não tomar o número por completo */
  pendencias: string[];
}

const D = (v: number | null | undefined) => new Prisma.Decimal(v ?? 0);
const linha = (a: number | null | undefined, b: number | null | undefined) => emCentavos(D(a).mul(D(b)));
const n = (v: Prisma.Decimal) => v.toNumber();
const horasEmTexto = (h: number) => `${String(Math.round(h * 100) / 100).replace('.', ',')} h`;

export function resumoDoCusto(dados: DadosDoCusto): ResumoDoCusto {
  const pendencias: string[] = [];

  // Mão de obra: a hora trabalhada; a estimada só na OS executada antes do SN-61, sem horas
  const equipe = dados.equipe.map((p) => {
    const horas = p.horas_trabalhadas ?? p.horas_estimadas;
    return {
      nome: p.nome?.trim() || `${p.especialidade} (sem pessoa)`,
      especialidade: p.especialidade,
      horas_previstas: p.horas_estimadas,
      horas_trabalhadas: p.horas_trabalhadas,
      valor_hora: p.custo_hora,
      previsto: linha(p.custo_hora, p.horas_estimadas),
      real: linha(p.custo_hora, horas),
      semValor: !p.custo_hora && horas > 0,
      horas,
    };
  });
  const semValorHora = equipe.filter((p) => p.semValor);
  if (semValorHora.length) {
    pendencias.push(
      `Sem valor/hora, fora do custo: ${semValorHora.map((p) => `${p.nome} (${horasEmTexto(p.horas)})`).join(', ')}.`,
    );
  }

  const materiais = dados.materiais.map((m) => ({
    ...m,
    previsto: linha(m.custo_unitario, m.quantidade_planejada),
    real: linha(m.custo_unitario, m.quantidade_consumida),
  }));
  const materiaisSemPreco = materiais.filter((m) => !m.custo_unitario && (m.quantidade_consumida ?? 0) > 0);
  if (materiaisSemPreco.length) {
    pendencias.push(`Sem custo unitário, fora do custo: ${materiaisSemPreco.map((m) => m.descricao).join(', ')}.`);
  }
  // Consumo não registrado entra como zero: sem o aviso, "Material R$ 0,00 −100%" parecia economia
  const semConsumo = materiais.filter((m) => m.quantidade_consumida === null && m.quantidade_planejada > 0 && !!m.custo_unitario);
  if ((dados.apurado ?? true) && semConsumo.length) {
    pendencias.push(`Consumo não registrado, fora do custo: ${semConsumo.map((m) => m.descricao).join(', ')}.`);
  }

  const outros = dados.outros.map((o) => {
    const conferido = o.real !== null;
    // Não conferido: o previsto (a despesa do orçamento quase sempre aconteceu; tirá-la é que mente)
    const noReal = dados.outros_no_real ? emCentavos(conferido ? D(o.real) : D(o.previsto)) : null;
    return {
      descricao: o.descricao,
      natureza: o.natureza,
      rotulo: ROTULO_DO_ITEM[o.natureza],
      previsto: emCentavos(D(o.nao_previsto ? 0 : o.previsto)),
      real: o.real,
      no_real: noReal,
      conferido,
      nao_previsto: o.nao_previsto,
    };
  });
  const naoConferidos = outros.filter((o) => !o.conferido && !o.nao_previsto);
  if (dados.outros_no_real && naoConferidos.length) {
    pendencias.push(
      `${naoConferidos.length === 1 ? '1 outro custo não foi conferido e entra' : `${naoConferidos.length} outros custos não foram conferidos e entram`} pelo previsto.`,
    );
  }
  if (!dados.outros_no_real && (outros.length || dados.custos_adicionais)) {
    pendencias.push('OS finalizada antes de 22/10/2026: o custo real registrado não tinha os outros custos, que aparecem pelo previsto e fora do total.');
  }

  // As naturezas, na ordem do quadro: mão de obra, material, cada outro custo previsto, os não previstos, os adicionais antigos
  const naturezas: ResumoDoCusto['naturezas'] = [];
  const somar = (lista: Prisma.Decimal[]) => lista.reduce((s, v) => s.add(v), new Prisma.Decimal(0));
  // O real dos outros custos, ou null quando ficam fora do total (OS finalizada antes do SN-93)
  const realDosOutros = (lista: typeof outros) => (dados.outros_no_real ? n(somar(lista.map((o) => o.no_real ?? new Prisma.Decimal(0)))) : null);
  naturezas.push({ natureza: 'MAO_DE_OBRA', rotulo: ROTULO_DA_NATUREZA.MAO_DE_OBRA, previsto: n(somar(equipe.map((p) => p.previsto))), real: n(somar(equipe.map((p) => p.real))) });
  naturezas.push({ natureza: 'MATERIAL', rotulo: ROTULO_DA_NATUREZA.MATERIAL, previsto: n(somar(materiais.map((m) => m.previsto))), real: n(somar(materiais.map((m) => m.real))) });
  const previstos = outros.filter((o) => !o.nao_previsto);
  // Na ordem fixa das naturezas, e não na dos itens: o quadro sai igual em toda OS
  for (const natureza of NATUREZAS_DOS_OUTROS_CUSTOS.filter((n) => previstos.some((o) => o.natureza === n))) {
    const da = previstos.filter((o) => o.natureza === natureza);
    naturezas.push({ natureza, rotulo: ROTULO_DA_NATUREZA[natureza], previsto: n(somar(da.map((o) => o.previsto))), real: realDosOutros(da) });
  }
  const naoPrevistos = outros.filter((o) => o.nao_previsto);
  if (naoPrevistos.length) {
    naturezas.push({ natureza: 'NAO_PREVISTO', rotulo: 'Não previstos', previsto: 0, real: realDosOutros(naoPrevistos) });
  }
  const adicionais = emCentavos(D(dados.custos_adicionais));
  if (!adicionais.isZero()) {
    naturezas.push({ natureza: 'ADICIONAIS', rotulo: 'Adicionais (sem descrição)', previsto: 0, real: dados.outros_no_real ? n(adicionais) : null });
  }

  // O previsto que se compara com o real é o do que entra nele; o ajuste da aprovação, contra todas as linhas
  const previstoDasLinhas = naturezas.reduce((s, l) => s.add(l.previsto), new Prisma.Decimal(0));
  const previsto = naturezas.filter((l) => l.real !== null).reduce((s, l) => s.add(l.previsto), new Prisma.Decimal(0));
  const real = naturezas.reduce((s, l) => s.add(l.real ?? 0), new Prisma.Decimal(0));

  const instrucoes = dados.instrucoes.map((i) => {
    const doCadastroHoje = i.valor === null && i.valor_do_cadastro_hoje !== undefined && i.valor_do_cadastro_hoje !== null;
    const valor = i.valor ?? (doCadastroHoje ? i.valor_do_cadastro_hoje! : null);
    return {
      codigo: i.codigo,
      nome: i.nome,
      equipamento: i.equipamento,
      status: i.status,
      feita: i.status === 'CONCLUIDA',
      valor,
      valor_original: i.valor_original,
      ajustado: i.valor !== null && i.valor_original !== null && i.valor !== i.valor_original,
      do_cadastro_hoje: doCadastroHoje,
    };
  });
  const feitas = instrucoes.filter((i) => i.feita);
  if (instrucoes.some((i) => i.do_cadastro_hoje)) {
    pendencias.push('Instrução de antes de 22/10/2026 sem o valor registrado na OS: mostra o do cadastro de hoje.');
  }

  return {
    previsto: n(previsto),
    real: n(real),
    orcamento_previsto: dados.orcamento_previsto,
    ajuste_do_orcamento: dados.orcamento_previsto === null ? 0 : n(emCentavos(D(dados.orcamento_previsto).sub(previstoDasLinhas))),
    outros_fora_do_total: naturezas.some((l) => l.real === null),
    naturezas,
    equipe: equipe.map(({ semValor: _s, horas: _h, previsto: p, real: r, ...pessoa }) => ({ ...pessoa, previsto: n(p), real: n(r) })),
    materiais: materiais.map(({ previsto: p, real: r, ...m }) => ({ ...m, previsto: n(p), real: n(r) })),
    outros: outros.map(({ previsto: p, no_real: r, ...o }) => ({ ...o, previsto: n(p), no_real: r === null ? null : n(r) })),
    instrucoes,
    instrucoes_total: n(somar(instrucoes.map((i) => D(i.valor)))),
    instrucoes_feitas: feitas.length,
    instrucoes_feitas_total: n(somar(feitas.map((i) => D(i.valor)))),
    pendencias,
  };
}

/** O custo real que a OS grava: o mesmo total do resumo (uma conta só, SN-81) */
export const custoRealDosDados = (dados: DadosDoCusto) => new Prisma.Decimal(resumoDoCusto(dados).real);

/**
 * Na OS finalizada pelas regras de antes (conteúdo da versão 1, ou sem código), o
 * resumo refaz o real pelas linhas registradas, e ele pode não ser o gravado (o
 * consumo registrado depois do Executar, antes do SN-81, ficava fora). O número
 * que o registro guarda é dito, para quem lê não tomar um pelo outro.
 */
export function comOCustoRegistrado(resumo: ResumoDoCusto, registrado: number | null): ResumoDoCusto {
  if (registrado === null || new Prisma.Decimal(registrado).equals(resumo.real)) return resumo;
  const emReais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return {
    ...resumo,
    pendencias: [
      ...resumo.pendencias,
      `Custo real registrado na finalização: ${emReais(registrado)} (a conta pelas linhas registradas dá ${emReais(resumo.real)}).`,
    ],
  };
}

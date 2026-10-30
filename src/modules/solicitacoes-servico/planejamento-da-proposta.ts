/**
 * O planejamento calculado da proposta e as linhas automáticas da logística
 * (30/out/2026). Pedido do usuário: calcular sozinho o máximo que der a partir
 * do km, dos dias, das pessoas e das noites, com os padrões de custo da Aupus.
 *
 * Decisões do usuário:
 * - o km de ida é o de volta: a ida e volta é sempre o dobro da ida;
 * - o deslocamento interno (o km rodado na obra) é o total do serviço, e vazio
 *   vale o padrão (10% da ida e volta);
 * - a viagem (1h30 a cada 100 km) entra nos dias sugeridos, e a ida acima do
 *   limite do bate-volta (2 h) sugere pernoite;
 * - 1 veículo a cada 4 pessoas; 2 pessoas quando a proposta não diz;
 * - almoço todo dia; café, jantar e pernoite só nas noites fora;
 * - as linhas automáticas acompanham o planejamento, e a que a pessoa ajusta à
 *   mão deixa de acompanhar.
 *
 * Campo vazio no planejamento vale o calculado; o digitado manda. As noites
 * digitadas decidem o bate-volta: com noites, a estrada vai uma vez; com zero,
 * a equipe volta todo dia (o km e os dias seguem isso).
 */

/** Os padrões da logística automática (`padroes_da_proposta`) */
export interface PadroesDaLogistica {
  /** R$ por km rodado */
  valorKm: number;
  /** Horas de estrada a cada 100 km */
  horasPor100Km: number;
  /** O deslocamento interno quando ninguém o digita: % da ida e volta */
  internoPercentual: number;
  /** Por pessoa: café da manhã, almoço, jantar (por refeição) e pernoite (por noite) */
  cafe: number;
  almoco: number;
  jantar: number;
  pernoite: number;
  pessoasPorVeiculo: number;
  /** Até quantas horas de ida a equipe volta no mesmo dia */
  bateVoltaHoras: number;
  /** As pessoas quando a proposta não diz */
  pessoasPadrao: number;
}

/** Os valores do usuário (30/out/2026), usados sem a linha no banco */
export const PADROES_DA_LOGISTICA: PadroesDaLogistica = {
  valorKm: 2.5,
  horasPor100Km: 1.5,
  internoPercentual: 10,
  cafe: 10,
  almoco: 20,
  jantar: 20,
  pernoite: 100,
  pessoasPorVeiculo: 4,
  bateVoltaHoras: 2,
  pessoasPadrao: 2,
};

/** As horas de uma jornada (a spec): os dias são as horas ÷ 8, para cima */
export const HORAS_POR_DIA = 8;

/** O que a pessoa digitou no planejamento (nulo = vazio) e as horas dos passos das instruções */
export interface PlanejamentoDigitado {
  idaKm: number | null;
  internoKm: number | null;
  dias: number | null;
  pessoas: number | null;
  noites: number | null;
  horasDosPassos: number;
}

export interface PlanejamentoCalculado {
  /** As horas dos passos das instruções (a base dos dias; a tela mostra a conta) */
  horasDosPassos: number;
  idaEVoltaKm: number | null;
  /** O interno que vale: o digitado ou o padrão */
  internoKm: number | null;
  internoSugeridoKm: number | null;
  /** As horas de estrada de um trecho (a ida, ou a volta) */
  horasPorTrecho: number | null;
  /** A equipe volta no mesmo dia; nulo sem a distância */
  bateVolta: boolean | null;
  diasSugeridos: number | null;
  /** Os que valem: o digitado ou o sugerido */
  dias: number | null;
  noitesSugeridas: number | null;
  noites: number | null;
  /** As que valem: as digitadas ou as padrão */
  pessoas: number | null;
  veiculos: number | null;
  /** O km de cada veículo: a estrada (uma ida e volta, ou uma por dia no bate-volta) e o interno */
  kmPorVeiculo: number | null;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;

/** Para cima, sem o ruído do ponto flutuante (9,0000001 h não é um dia a mais) */
const paraCima = (valor: number) => Math.ceil(Math.round(valor * 1000) / 1000);

const positivo = (valor: number | null) => (valor !== null && valor > 0 ? valor : null);

/**
 * Os dias pela soma das horas dos passos (em sequência, sem inventar
 * simultaneidade) e a viagem:
 * - sem a distância: as horas ÷ 8;
 * - com pernoite: a viagem vai uma vez (ida e volta) e soma às horas;
 * - no bate-volta: a estrada sai de cada dia (sobra 8 h − ida e volta para trabalhar).
 */
function diasPelasHoras(horasDosPassos: number, horasPorTrecho: number | null, bateVolta: boolean | null): number | null {
  if (horasDosPassos <= 0) return null;
  if (horasPorTrecho === null) return paraCima(horasDosPassos / HORAS_POR_DIA);
  const trabalhoNoBateVolta = HORAS_POR_DIA - 2 * horasPorTrecho;
  if (bateVolta && trabalhoNoBateVolta > 0) return paraCima(horasDosPassos / trabalhoNoBateVolta);
  return paraCima((horasDosPassos + 2 * horasPorTrecho) / HORAS_POR_DIA);
}

export function planejamentoCalculado(d: PlanejamentoDigitado, p: PadroesDaLogistica): PlanejamentoCalculado {
  const ida = positivo(d.idaKm);
  const idaEVoltaKm = ida === null ? null : centavos(2 * ida);
  const internoSugeridoKm = idaEVoltaKm === null ? null : centavos((idaEVoltaKm * p.internoPercentual) / 100);
  const internoKm = d.internoKm ?? internoSugeridoKm;
  const horasPorTrecho = ida === null ? null : Math.round(((ida / 100) * p.horasPor100Km) * 100) / 100;
  // As noites digitadas mandam: com noites, a equipe dorme no local; com zero, volta todo dia
  const bateVolta = horasPorTrecho === null ? null : d.noites !== null ? d.noites === 0 : horasPorTrecho <= p.bateVoltaHoras;

  const diasSugeridos = diasPelasHoras(d.horasDosPassos, horasPorTrecho, bateVolta);
  const dias = d.dias ?? diasSugeridos;
  // Dormir fora: uma noite a menos que os dias; no bate-volta, nenhuma
  const noitesSugeridas = bateVolta === null || dias === null ? null : bateVolta ? 0 : Math.max(paraCima(dias) - 1, 0);
  const noites = d.noites ?? noitesSugeridas;

  const pessoas = positivo(d.pessoas) ?? positivo(p.pessoasPadrao);
  const veiculos = pessoas === null ? null : Math.ceil(pessoas / Math.max(p.pessoasPorVeiculo, 1));
  // No bate-volta de vários dias o veículo faz a estrada todo dia
  const viagens = bateVolta && dias !== null ? Math.max(paraCima(dias), 1) : 1;
  const estrada = idaEVoltaKm === null ? null : idaEVoltaKm * viagens;
  const kmPorVeiculo = estrada === null && internoKm === null ? null : centavos((estrada ?? 0) + (internoKm ?? 0));

  return {
    horasDosPassos: d.horasDosPassos,
    idaEVoltaKm,
    internoKm,
    internoSugeridoKm,
    horasPorTrecho,
    bateVolta,
    diasSugeridos,
    dias,
    noitesSugeridas,
    noites,
    pessoas,
    veiculos,
    kmPorVeiculo,
  };
}

// ============================================================
// AS LINHAS AUTOMÁTICAS
// ============================================================

/** As linhas que o planejamento calcula, na ordem em que entram na tabela */
export const CHAVES_AUTOMATICAS = ['KM', 'CAFE', 'ALMOCO', 'JANTAR', 'PERNOITE'] as const;
export type ChaveAutomatica = (typeof CHAVES_AUTOMATICAS)[number];

/** A tabela de cada chave: o km é do deslocamento; as refeições e o pernoite, das diárias */
export const TABELA_DA_CHAVE: Record<ChaveAutomatica, 'DESLOCAMENTO' | 'DIARIA'> = {
  KM: 'DESLOCAMENTO',
  CAFE: 'DIARIA',
  ALMOCO: 'DIARIA',
  JANTAR: 'DIARIA',
  PERNOITE: 'DIARIA',
};

/** A linha que o planejamento pede (o preço é o padrão de hoje, só para a que nasce) */
export interface LinhaAutomatica {
  chave: ChaveAutomatica;
  tabela: 'DESLOCAMENTO' | 'DIARIA';
  descricao: string;
  /** Diárias: pessoas × dias ou noites; deslocamento: os veículos */
  quantidade: number;
  km: number | null;
  valor_unitario: number | null;
  valor_km: number | null;
}

/**
 * As linhas que o planejamento calcula agora. Sem o dado de que ela depende
 * (as pessoas, os dias, as noites, o km), a linha não existe: nada se inventa.
 */
export function linhasAutomaticas(c: PlanejamentoCalculado, p: PadroesDaLogistica): LinhaAutomatica[] {
  const linhas: LinhaAutomatica[] = [];
  if (c.kmPorVeiculo !== null && c.kmPorVeiculo > 0) {
    linhas.push({ chave: 'KM', tabela: 'DESLOCAMENTO', descricao: 'Veículo da equipe', quantidade: c.veiculos ?? 1, km: c.kmPorVeiculo, valor_unitario: null, valor_km: p.valorKm });
  }
  const diaria = (chave: Exclude<ChaveAutomatica, 'KM'>, descricao: string, vezes: number | null, valor: number) => {
    const quantidade = c.pessoas !== null && vezes !== null ? c.pessoas * vezes : 0;
    if (quantidade > 0) linhas.push({ chave, tabela: 'DIARIA', descricao, quantidade, km: null, valor_unitario: valor, valor_km: null });
  };
  const noites = c.noites !== null && c.noites > 0 ? c.noites : null;
  diaria('CAFE', 'Café da manhã', noites, p.cafe);
  diaria('ALMOCO', 'Almoço', c.dias !== null ? paraCima(c.dias) : null, p.almoco);
  diaria('JANTAR', 'Jantar', noites, p.jantar);
  diaria('PERNOITE', 'Pernoite', noites, p.pernoite);
  return linhas;
}

/** Uma linha de logística como está gravada, no que a sincronização olha */
export interface LinhaGravada {
  id: string;
  automatica: string | null;
  ajustada: boolean;
  ativo: boolean;
  quantidade: number | null;
  km: number | null;
}

export interface PlanoDaSincronizacao {
  criar: LinhaAutomatica[];
  /** As quantidades novas (o preço e a descrição da linha ficam: são da proposta) */
  atualizar: Array<{ id: string; quantidade: number; km: number | null }>;
  apagar: string[];
}

/**
 * O que muda nas linhas gravadas para seguirem o planejamento:
 * - a ajustada à mão não se mexe;
 * - a que existe e o planejamento ainda pede recebe as quantidades (o preço fica);
 * - a que falta nasce, com o preço padrão de hoje;
 * - a que o planejamento não pede mais (as noites voltaram a zero) fica com
 *   quantidade zero, e não sai: o preço e o nome que a pessoa acertou nela voltam
 *   com a quantidade (apagada, ela renascia com o preço padrão, calada).
 * `apagar` fica para quem precisar (hoje, nada apaga).
 */
export function planoDaSincronizacao(gravadas: LinhaGravada[], pedidas: LinhaAutomatica[]): PlanoDaSincronizacao {
  const plano: PlanoDaSincronizacao = { criar: [], atualizar: [], apagar: [] };
  for (const chave of CHAVES_AUTOMATICAS) {
    const gravada = gravadas.find((g) => g.automatica === chave);
    const pedida = pedidas.find((p) => p.chave === chave);
    if (gravada?.ajustada) continue;
    if (!gravada) {
      if (pedida) plano.criar.push(pedida);
      continue;
    }
    if (!pedida) {
      if (gravada.quantidade !== 0) plano.atualizar.push({ id: gravada.id, quantidade: 0, km: gravada.km });
      continue;
    }
    if (gravada.quantidade !== pedida.quantidade || gravada.km !== pedida.km) {
      plano.atualizar.push({ id: gravada.id, quantidade: pedida.quantidade, km: pedida.km });
    }
  }
  return plano;
}

import { corretivaDoPeriodo, paradaNoPeriodo } from './confiabilidade';
import type { CustosDoPainel } from './custo-do-painel';
import {
  STATUS_CONCLUIDO,
  agruparOrdens,
  fimDaOrdem,
  horasEstimadas,
  naEstimativaPadrao,
  type JanelaDoPainel,
  type OrdemDoPainel,
} from './recorte-do-painel';

/**
 * Uma OS que entrou em alguma conta do painel, como a exportação a mostra
 * (SN-82): para quem quiser conferir o número, linha a linha. As marcas saem
 * dos MESMOS grupos do painel (`agruparOrdens`) e dos mesmos predicados da
 * confiabilidade: uma regra copiada aqui divergiria calada quando a do painel
 * mudasse.
 */
export interface OrdemDaConta {
  id: string;
  numero: string;
  tipo: string;
  origem: string;
  status: string;
  planta: string | null;
  /** Os equipamentos DA OS (tarefa, anomalia, solicitação ou coluna), pelo nome */
  equipamentos: string[];
  criada_em: string;
  programada_para: string | null;
  iniciada_em: string | null;
  /** A data de fim; sem ela (legado), a de início — a mesma que o painel usa */
  terminou_em: string | null;
  aberta: boolean;
  concluida_no_periodo: boolean;
  criada_no_periodo: boolean;
  programada_no_periodo: boolean;
  /** A parada (com ida e volta) cruza o período: conta nas horas paradas da disponibilidade */
  parada_no_periodo: boolean;
  /** A corretiva entra na base do MTBF e do MTTR: parou no período (sem parada, terminou nele) */
  corretiva_do_periodo: boolean;
  horas_estimadas: number;
  sem_estimativa: boolean;
  /** Só a concluída no período tem custo: é o que o gráfico de custo soma */
  custo: { mao_de_obra: number; material: number; adicionais: number; total: number } | null;
  equipamento_parou: boolean | null;
  parada_inicio: string | null;
  parada_fim: string | null;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

/** As OS que entram em alguma conta do período, na ordem do número */
export function ordensDaConta(
  ordens: OrdemDoPainel[],
  janela: JanelaDoPainel,
  custos: CustosDoPainel,
  agora = new Date(),
): OrdemDaConta[] {
  const grupos = agruparOrdens(ordens, janela);
  const em = (lista: OrdemDoPainel[]) => new Set(lista.map((o) => o.id));
  const abertas = em(grupos.emAberto);
  const concluidas = em(grupos.concluidas);
  const criadas = em(grupos.criadas);
  const programadas = em(grupos.programadas);

  return ordens
    .map((o): OrdemDaConta => {
      const concluida = STATUS_CONCLUIDO.includes(o.status);
      const daConfiabilidade = { ...o, fim: fimDaOrdem(o) };
      const custo = concluidas.has(o.id) ? custos.get(o.id) : undefined;
      return {
        id: o.id.trim(),
        numero: o.numero_os,
        tipo: o.tipo,
        origem: o.origem,
        status: o.status,
        planta: o.planta?.nome ?? null,
        equipamentos: o.equipamentos.map((e) => e.nome || 'Sem nome'),
        criada_em: new Date(o.criado_em).toISOString(),
        programada_para: iso(o.data_hora_programada),
        iniciada_em: iso(o.data_hora_inicio_real),
        terminou_em: concluida ? iso(fimDaOrdem(o)) : null,
        aberta: abertas.has(o.id),
        concluida_no_periodo: concluidas.has(o.id),
        criada_no_periodo: criadas.has(o.id),
        programada_no_periodo: programadas.has(o.id),
        // A confiabilidade lê só as concluídas
        parada_no_periodo: concluida && paradaNoPeriodo(o, janela, agora),
        corretiva_do_periodo: concluida && corretivaDoPeriodo(daConfiabilidade, janela, agora),
        horas_estimadas: horasEstimadas(o),
        sem_estimativa: naEstimativaPadrao(o),
        custo: custo
          ? { mao_de_obra: custo.maoDeObra, material: custo.material, adicionais: custo.adicionais, total: custo.total }
          : null,
        equipamento_parou: o.equipamento_parou,
        parada_inicio: iso(o.parada_inicio),
        parada_fim: iso(o.parada_fim),
      };
    })
    .filter(
      (o) =>
        o.aberta || o.concluida_no_periodo || o.criada_no_periodo || o.programada_no_periodo || o.parada_no_periodo || o.corretiva_do_periodo,
    )
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

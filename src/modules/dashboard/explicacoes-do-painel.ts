/**
 * Como cada gráfico do painel sai (a legenda das fórmulas): o texto mora aqui,
 * junto da conta, e não no front, para não divergir dela. A tela mostra no
 * ícone de informação de cada gráfico e lista tudo em "Como se calcula".
 */
export interface Explicacao {
  /** O bloco do painel (a chave dele na resposta) */
  id: string;
  rotulo: string;
  formula: string;
  /** Em quantos registros o número se baseia, e o que ficou de fora */
  base?: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O que cada explicação precisa saber dos blocos já calculados */
export interface ContagensDoPainel {
  doPlano: number;
  doPlanoConcluidas: number;
  metaDoPlano: number;
  criadas: number;
  concluidasComCusto: number;
  anomalias: { identificadas: number; viraramOS: number; concluidas: number; metaCiclo: number };
  abertas: number;
  concluidasComEquipe: number;
  metaPrazo: number;
  /** As que o próprio bloco já explica (o custo e o HH: a base depende da conta deles) */
  custo: { formula: string; base: string };
  hh: { formula: string; base: string };
}

export function explicacoesDosGraficos(c: ContagensDoPainel): Explicacao[] {
  const criadas = `${plural(c.criadas, 'OS criada', 'OS criadas')} no período.`;
  return [
    {
      id: 'execucaoPlano',
      rotulo: 'Execução do plano',
      formula: `OS do plano de manutenção (e das tarefas) programadas para o período, sem as canceladas: as concluídas (executada, auditada ou finalizada) sobre o total. Meta: ${c.metaDoPlano}%.`,
      base: `${plural(c.doPlano, 'OS do plano programada', 'OS do plano programadas')} no período, ${plural(c.doPlanoConcluidas, 'concluída', 'concluídas')}.`,
    },
    {
      id: 'planejadaVsNao',
      rotulo: 'Planejada vs. não planejada',
      formula: 'Das OS criadas no período: não planejada é a que nasceu de anomalia (ou avulsa, antes de toda OS ter origem); planejada, as do plano, das tarefas e das solicitações. Referência: 80% planejada.',
      base: criadas,
    },
    {
      id: 'origemOS',
      rotulo: 'Origem da OS',
      formula: 'Das OS criadas no período, a parte de cada origem: plano (plano de manutenção e tarefas), anomalia e solicitação (as avulsas antigas contam em solicitação).',
      base: criadas,
    },
    {
      id: 'mixTipo',
      rotulo: 'Mix por tipo',
      formula: 'Das OS criadas no período, a parte de cada tipo; melhoria = inspeção e visita técnica. Alvo: preventiva e preditiva acima de 70%.',
      base: criadas,
    },
    { id: 'custo', rotulo: 'Custo de manutenção', ...c.custo },
    {
      id: 'custoPorOS',
      rotulo: 'Custo médio por OS',
      formula: 'Das OS concluídas no período que tiveram custo: o custo (mão de obra + material + adicionais) dividido pela quantidade, no mês em que terminaram. A corretiva separada das demais.',
      base: `${plural(c.concluidasComCusto, 'OS concluída com custo', 'OS concluídas com custo')} no período.`,
    },
    {
      id: 'anomalias',
      rotulo: 'Anomalias',
      formula: `Anomalias registradas no período, no mês do registro: resolvida (com OS concluída), com OS em andamento e sem OS (a OS cancelada não conta). Ciclo até a OS: dias do registro à primeira OS; execução: da criação da OS concluída ao fim dela. Meta do ciclo: ${c.anomalias.metaCiclo} dias.`,
      base: `${plural(c.anomalias.identificadas, 'anomalia registrada', 'anomalias registradas')} no período: ${plural(c.anomalias.viraramOS, 'virou OS', 'viraram OS')}, ${plural(c.anomalias.concluidas, 'resolvida', 'resolvidas')}.`,
    },
    { id: 'hh', rotulo: 'HH planejado vs. apontado', ...c.hh },
    {
      id: 'backlogIdade',
      rotulo: 'Envelhecimento do backlog',
      formula: 'OS abertas agora (pendente, em execução ou pausada), de qualquer data, pela idade desde a criação.',
      base: `${plural(c.abertas, 'OS aberta', 'OS abertas')}.`,
    },
    {
      id: 'ofensores',
      rotulo: 'Maiores ofensores',
      formula: 'Os 5 equipamentos com maior custo nas OS concluídas no período (o equipamento da OS: o da tarefa, da anomalia, da solicitação ou o da própria OS). A OS de vários equipamentos divide o custo em partes iguais.',
      base: `${plural(c.concluidasComCusto, 'OS concluída com custo', 'OS concluídas com custo')} no período.`,
    },
    {
      id: 'prazoPorEquipe',
      rotulo: 'OS no prazo, por equipe',
      formula: `Das OS concluídas no período com equipe registrada: as que terminaram até a data programada, sobre o total da equipe. Meta: ${c.metaPrazo}%.`,
      base: `${plural(c.concluidasComEquipe, 'OS concluída com equipe', 'OS concluídas com equipe')} no período.`,
    },
  ];
}

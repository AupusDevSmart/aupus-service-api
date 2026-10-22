import type { Prisma } from '@/core';

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
/** Brasília é UTC-3 fixo (sem horário de verão desde 2019) */
const BRASILIA_MS = 3 * HORA_MS;

interface OrdemComPrazo {
  data_hora_programada: Date | null;
  duracao_estimada?: Prisma.Decimal | number | null;
}

/**
 * O prazo da OS: o fim do dia programado, no horário de Brasília, ou o término
 * previsto (a hora programada mais a duração estimada), o que vier depois.
 *
 * Até 22/out/2026 o painel comparava o FIM da OS com `data_hora_programada`, que
 * é a hora programada para COMEÇAR: só contava no prazo a OS que terminava antes
 * de começar, e o cartão mostrava "0% no prazo" com 162 concluídas. A aberta
 * virava "atrasada" um minuto depois da hora de começar, já em execução.
 *
 * Sem data programada não há prazo (null): a OS não entra como atrasada nem
 * como no prazo.
 */
export function prazoDaOrdem(o: OrdemComPrazo): Date | null {
  if (!o.data_hora_programada) return null;
  const programada = new Date(o.data_hora_programada).getTime();
  const inicioDoDia = Math.floor((programada - BRASILIA_MS) / DIA_MS) * DIA_MS + BRASILIA_MS;
  const fimDoDia = inicioDoDia + DIA_MS - 1000;
  const horas = o.duracao_estimada == null ? 0 : Number(o.duracao_estimada);
  const termino = programada + (Number.isFinite(horas) && horas > 0 ? horas * HORA_MS : 0);
  return new Date(Math.max(fimDoDia, termino));
}

/** Terminou até o prazo. Sem prazo, ou sem fim, não conta como no prazo */
export function terminouNoPrazo(o: OrdemComPrazo, fim: Date | null): boolean {
  const prazo = prazoDaOrdem(o);
  return !!prazo && !!fim && new Date(fim).getTime() <= prazo.getTime();
}

/** Aberta e com o prazo vencido */
export function passouDoPrazo(o: OrdemComPrazo, agora: Date): boolean {
  const prazo = prazoDaOrdem(o);
  return !!prazo && prazo.getTime() < agora.getTime();
}

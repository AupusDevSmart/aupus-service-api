import { ESCALA_ANTIGA } from '@/core/modules/equipamentos/criticidade-pela-matriz';

/**
 * Prioridade da OS gerada pelo cron a partir da criticidade (do equipamento e
 * da tarefa).
 *
 * A criticidade é de 1 (muito baixa) a 5 (muito alta); cadastro antigo ainda
 * tem A/B/C, com A a mais crítica. A maior do grupo decide. Preventiva vai no
 * máximo a ALTA: CRITICA fica para corretiva e anomalia, que é urgência de
 * verdade — senão o indicador "Críticas" da execução enche de preventiva.
 */
export type PrioridadeDaPreventiva = 'ALTA' | 'MEDIA' | 'BAIXA';

export function nivelDeCriticidade(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().toUpperCase();
  if (texto in ESCALA_ANTIGA) return ESCALA_ANTIGA[texto];
  const nivel = Number(texto);
  return texto !== '' && Number.isInteger(nivel) && nivel >= 1 && nivel <= 5 ? nivel : null;
}

export function prioridadePelaCriticidade(
  valores: Array<string | number | null | undefined>,
): PrioridadeDaPreventiva {
  const niveis = valores.map(nivelDeCriticidade).filter((n): n is number => n !== null);
  if (niveis.length === 0) return 'MEDIA';
  const maior = Math.max(...niveis);
  if (maior >= 4) return 'ALTA';
  if (maior === 3) return 'MEDIA';
  return 'BAIXA';
}

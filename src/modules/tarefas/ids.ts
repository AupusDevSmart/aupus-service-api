// src/modules/tarefas/ids.ts

/**
 * As duas formas em que o id de uma tarefa aparece no banco.
 *
 * `tarefas.id` é `VarChar(26)` e os cuid antigos têm **25** caracteres. Já
 * `tarefas_os.tarefa_id` e `tarefas_programacao_os.tarefa_id` são `Char(26)`,
 * que o Postgres preenche com espaço à direita. Resultado: o mesmo id fica
 * gravado como 25 chars num lado e 26 no outro, e um
 * `where tarefa_id in [id]` não acha nada — silenciosamente.
 *
 * Foi assim que o histórico do equipamento mostrava "nunca executada" com uma
 * OS finalizada e a tarefa concluída bem ali na lista, e é o mesmo motivo pelo
 * qual o agendador não enxergava execução nenhuma e tratava toda tarefa antiga
 * como se nunca tivesse rodado.
 *
 * Consultar pelas duas formas resolve sem depender de migração de tipo.
 */
export const variantesDeId = (id: string): string[] => {
  const limpo = id?.trim() ?? '';
  if (!limpo) return [];
  return limpo.length >= 26 ? [limpo] : [limpo, limpo.padEnd(26, ' ')];
};

export const variantesDeIds = (ids: string[]): string[] =>
  [...new Set(ids.flatMap(variantesDeId))];

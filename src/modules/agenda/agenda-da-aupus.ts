/**
 * Feriados e dias úteis valem para várias plantas (o geral, para todas): o
 * cliente e o técnico só leem, mesmo com agenda.manage dado direto (decisão do
 * usuário, 19/out/2026, SN-76). A tela (`@SoSemEscopo` no AgendaController) e a
 * planilha de feriados usam esta mensagem.
 */
export const AGENDA_DA_AUPUS = 'Cliente e técnico não alteram a agenda: feriados e dias úteis são cadastrados pela Aupus.';

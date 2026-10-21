import type { TipoOS, TipoSolicitacaoServico } from '@prisma/client';

/**
 * O tipo da OS que nasce de uma solicitação. Só o pedido de manutenção
 * corretiva vira CORRETIVA: até o SN-87 instalação, modificação, remoção e
 * "outro" também viravam, e o técnico tinha de inventar sintoma, causa e ação
 * de falha para executar a instalação de um circuito (a corretiva exige os
 * três), além de o serviço entrar no indicador de corretivas sem ter havido
 * falha. Serviço sem falha é VISITA_TECNICA, que o painel conta com as
 * inspeções em "melhoria". O planejador continua podendo trocar o tipo.
 */
const TIPO_DA_OS: Record<TipoSolicitacaoServico, TipoOS> = {
  MANUTENCAO_PREVENTIVA: 'PREVENTIVA',
  MANUTENCAO_CORRETIVA: 'CORRETIVA',
  INSPECAO: 'INSPECAO',
  CALIBRACAO: 'INSPECAO',
  INSTALACAO: 'VISITA_TECNICA',
  MODIFICACAO: 'VISITA_TECNICA',
  REMOCAO: 'VISITA_TECNICA',
  CONSULTORIA: 'VISITA_TECNICA',
  TREINAMENTO: 'VISITA_TECNICA',
  OUTRO: 'VISITA_TECNICA',
};

export function tipoDaOSDaSolicitacao(tipo: TipoSolicitacaoServico | string): TipoOS {
  return TIPO_DA_OS[tipo as TipoSolicitacaoServico] ?? 'VISITA_TECNICA';
}

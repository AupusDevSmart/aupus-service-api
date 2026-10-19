import { BadRequestException } from '@nestjs/common';
import { origemDaProgramacao } from '../../common/helpers/status-da-origem';

/**
 * Toda OS tem origem (SN-69, pedido do usuário em 19/out/2026). A programação
 * MANUAL nascia sem o porquê — sem anomalia, solicitação, plano nem tarefa — e
 * os indicadores não conseguiam atribuí-la a nada. Serviço avulso vira uma
 * solicitação de serviço (ou uma anomalia), e a programação sai dela.
 *
 * E a origem tem de apontar para o que a originou: "ANOMALIA" sem a anomalia é
 * o mesmo buraco com outro nome. Plano e tarefa se reconhecem pelas tarefas
 * vinculadas (o plano_manutencao_id quase nunca vem: o seletor manda as tarefas).
 *
 * As programações e OS MANUAL que já existem continuam legíveis. A avulsa
 * antiga pendente não se aprova (a OS nasceria sem origem) nem se edita sem
 * ganhar uma origem — e a tela não troca a origem na edição: o caminho é
 * cancelar e programar a partir de uma solicitação ou de uma anomalia.
 */
export const ORIGEM_AVULSA_RECUSADA =
  'Toda OS tem origem: programe a partir de uma anomalia, de uma solicitação de serviço ou das tarefas de um plano. ' +
  'Para um serviço avulso, registre uma solicitação de serviço e programe a partir dela.';

export interface OrigemDaProgramacaoFinal {
  origem?: string | null;
  anomalia_id?: string | null;
  solicitacao_servico_id?: string | null;
  dados_origem?: unknown;
  /** Quantas tarefas a programação tem (ou terá, na criação) */
  tarefas: number;
}

/** A programação avulsa de antes do SN-69: nem se aprova nem se edita assim */
export const AVULSA_ANTIGA_RECUSADA =
  'Esta programação não tem origem (é avulsa, de antes da regra): não pode ser aprovada nem editada assim. ' +
  'Cancele-a e programe o serviço a partir de uma solicitação de serviço ou de uma anomalia.';

/** `avulsaAntiga`: a programação já era MANUAL (editar ou aprovar a de antes da regra) */
export function exigirOrigem(programacao: OrigemDaProgramacaoFinal, { avulsaAntiga = false } = {}): void {
  const { anomaliaId, solicitacaoId } = origemDaProgramacao(programacao);
  switch (programacao.origem) {
    case 'ANOMALIA':
      if (!anomaliaId) throw new BadRequestException('Origem anomalia: informe qual anomalia (anomalia_id).');
      return;
    case 'SOLICITACAO_SERVICO':
      if (!solicitacaoId) throw new BadRequestException('Origem solicitação de serviço: informe qual solicitação (solicitacao_servico_id).');
      return;
    case 'TAREFA':
    case 'PLANO_MANUTENCAO':
      if (programacao.tarefas === 0) throw new BadRequestException('Origem plano ou tarefa: informe as tarefas (tarefas_ids).');
      return;
    default:
      // MANUAL e o que vier sem origem
      throw new BadRequestException(avulsaAntiga ? AVULSA_ANTIGA_RECUSADA : ORIGEM_AVULSA_RECUSADA);
  }
}

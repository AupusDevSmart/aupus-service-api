import { PrioridadeSolicitacao } from '@/core';
import { ChamadoNexonDto } from './dto/chamado-nexon.dto';

const MOTIVO_TEXTO: Record<string, string> = {
  FALHA: 'Falha no equipamento',
  ALARME: 'Alarme',
  CAMPO: 'Constatado em campo',
  OUTRO: 'Outro',
};

/** O que existe deste lado para os ids que o NexON mandou. */
export interface ContextoChamado {
  planta_id: string;
  equipamento?: { id: string; nome: string } | null;
  unidade_id?: string | null;
  proprietario_id?: string | null;
  planta_nome: string;
}

const mesmoId = (a?: string | null, b?: string | null) => (a?.trim() || null) === (b?.trim() || null);

/**
 * Os campos da solicitacao montados a partir do chamado — funcao pura, para o
 * teste provar o mapeamento sem banco.
 *
 * Id que nao existe aqui (equipamento ou unidade ainda nao sincronizados) nao
 * derruba a entrega: vira texto no fim da descricao, e quem programa a OS ve
 * qual era. Recusar faria o chamado morrer na fila do NexON por um cadastro que
 * ninguem do campo controla. Na descricao, e nao nas `observacoes`: nenhuma
 * tela mostra as observacoes da solicitacao, e a programacao copia a descricao.
 */
export function montarSolicitacao(dto: ChamadoNexonDto, ctx: ContextoChamado) {
  const faltando: string[] = [];
  if (dto.equipamento_id && !ctx.equipamento) faltando.push(`equipamento ${dto.equipamento_id}`);
  // A unidade pode vir do equipamento quando a informada nao existe aqui: a informada ainda falta
  if (dto.unidade_id && !mesmoId(dto.unidade_id, ctx.unidade_id)) faltando.push(`unidade ${dto.unidade_id}`);
  if (dto.proprietario_id && !ctx.proprietario_id) faltando.push(`proprietário ${dto.proprietario_id}`);

  const doNexon = [
    `Chamado #${dto.numero} do NexON (${dto.nexon_chamado_id}).`,
    dto.motivo ? `Motivo: ${MOTIVO_TEXTO[dto.motivo] ?? dto.motivo}.` : null,
    dto.observacao?.trim() ? `Observação do encaminhamento: ${dto.observacao.trim()}` : null,
    faltando.length ? `Não sincronizado com o Smart Service: ${faltando.join(', ')}.` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const autor = dto.autor_nome?.trim() || 'NexON';
  const aberto = dto.aberto_em ? new Date(dto.aberto_em) : null;

  return {
    titulo: dto.titulo.trim(),
    descricao: `${dto.descricao.trim()}\n\n${doNexon}`,
    tipo: 'MANUTENCAO_CORRETIVA' as const,
    origem: 'SISTEMA' as const,
    prioridade: (dto.prioridade ?? 'MEDIA') as PrioridadeSolicitacao,
    // A planta lida do banco, nao a do pedido
    planta_id: ctx.planta_id,
    unidade_id: ctx.unidade_id ?? null,
    equipamento_id: ctx.equipamento?.id ?? null,
    proprietario_id: ctx.proprietario_id ?? null,
    local: (ctx.equipamento?.nome ?? ctx.planta_nome).slice(0, 255),
    solicitante_nome: `${autor} (NexON)`,
    // Quando o chamado foi aberto, e nao quando chegou: e o pedido do cliente
    data_solicitacao: aberto ?? new Date(),
    nexon_chamado_id: dto.nexon_chamado_id,
    faltando,
  };
}

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
  equipamento?: { id: string; nome: string } | null;
  unidade_id?: string | null;
  proprietario_id?: string | null;
  planta_nome: string;
}

/**
 * Os campos da solicitacao montados a partir do chamado — funcao pura, para o
 * teste provar o mapeamento sem banco.
 *
 * Id que nao existe aqui (equipamento ou unidade ainda nao sincronizados) nao
 * derruba a entrega: vira texto nas observacoes, e quem programa a OS ve qual
 * era. Recusar faria o chamado morrer na fila do NexON por um cadastro que
 * ninguem do campo controla.
 */
export function montarSolicitacao(dto: ChamadoNexonDto, ctx: ContextoChamado) {
  const faltando: string[] = [];
  if (dto.equipamento_id && !ctx.equipamento) faltando.push(`equipamento ${dto.equipamento_id}`);
  if (dto.unidade_id && !ctx.unidade_id) faltando.push(`unidade ${dto.unidade_id}`);
  if (dto.proprietario_id && !ctx.proprietario_id) faltando.push(`proprietário ${dto.proprietario_id}`);

  const observacoes = [
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
    titulo: dto.titulo.trim().slice(0, 255),
    descricao: dto.descricao.trim(),
    tipo: 'MANUTENCAO_CORRETIVA' as const,
    origem: 'SISTEMA' as const,
    prioridade: (dto.prioridade ?? 'MEDIA') as PrioridadeSolicitacao,
    planta_id: dto.planta_id,
    unidade_id: ctx.unidade_id ?? null,
    equipamento_id: ctx.equipamento?.id ?? null,
    proprietario_id: ctx.proprietario_id ?? null,
    local: (ctx.equipamento?.nome ?? ctx.planta_nome).slice(0, 255),
    solicitante_nome: `${autor} (NexON)`.slice(0, 255),
    data_solicitacao: aberto && !Number.isNaN(aberto.getTime()) ? aberto : new Date(),
    observacoes,
    nexon_chamado_id: dto.nexon_chamado_id,
    faltando,
  };
}

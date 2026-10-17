import type { Prisma, sub_instrucoes } from '@prisma/client';
import { numeroOuNulo } from '@/common/helpers/leitura';
import type { CreateSubInstrucaoDto, SubInstrucaoResponseDto } from './dto';

/**
 * O passo da instrução como o service grava: a ordem é a posição na lista (a
 * lista é substituída inteira), o tipo vazio é VERIFICACAO e unidade e faixa
 * só ficam na leitura. O DTO já recusa unidade em verificação; aqui é a rede
 * para quem chama o service sem passar pelo DTO.
 */
export function passoParaGravar(sub: CreateSubInstrucaoDto, instrucaoId: string, indice: number): Prisma.sub_instrucoesCreateManyInput {
  const leitura = sub.tipo === 'LEITURA';
  return {
    instrucao_id: instrucaoId,
    descricao: sub.descricao,
    obrigatoria: sub.obrigatoria || false,
    tempo_estimado: sub.tempo_estimado,
    ordem: sub.ordem ?? indice + 1,
    tipo: sub.tipo ?? 'VERIFICACAO',
    exige_foto: sub.exige_foto ?? false,
    unidade: leitura ? sub.unidade?.trim() || null : null,
    valor_minimo: leitura ? (sub.valor_minimo ?? null) : null,
    valor_maximo: leitura ? (sub.valor_maximo ?? null) : null,
  };
}

/** A faixa é Decimal no banco, e o Decimal vira texto no JSON: a resposta leva número. */
export function passoParaResposta(passo: sub_instrucoes): SubInstrucaoResponseDto {
  return {
    id: passo.id,
    descricao: passo.descricao,
    obrigatoria: passo.obrigatoria,
    tempo_estimado: passo.tempo_estimado ?? undefined,
    ordem: passo.ordem,
    tipo: passo.tipo,
    exige_foto: passo.exige_foto,
    unidade: passo.unidade,
    valor_minimo: numeroOuNulo(passo.valor_minimo),
    valor_maximo: numeroOuNulo(passo.valor_maximo),
    created_at: passo.created_at,
    updated_at: passo.updated_at,
  };
}

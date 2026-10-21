import type { Prisma, sub_instrucoes } from '@prisma/client';
import { numeroOuNulo } from '@/common/helpers/leitura';
import type { CreateSubInstrucaoDto, SubInstrucaoResponseDto } from './dto';

/**
 * A disciplina do passo, a lista fechada do AupusProject (SubInstrucao::TIPOS):
 * a planilha de instruções de lá tem ADM, CIVIL, ELÉTRICO e MECÂNICO (SN-85).
 */
export const DISCIPLINAS = ['administrativo', 'civil', 'eletrico', 'mecanico'] as const;
export type Disciplina = (typeof DISCIPLINAS)[number];

/**
 * O passo da instrução como o service grava: a ordem é a posição na lista (a
 * lista é substituída inteira), o registro vazio é VERIFICACAO e unidade e
 * faixa só ficam na leitura. O DTO já recusa unidade em verificação; aqui é a
 * rede para quem chama o service sem passar pelo DTO.
 */
export function passoParaGravar(sub: CreateSubInstrucaoDto, instrucaoId: string, indice: number): Prisma.sub_instrucoesCreateManyInput {
  const leitura = sub.registro === 'LEITURA';
  return {
    instrucao_id: instrucaoId,
    descricao: sub.descricao,
    obrigatoria: sub.obrigatoria || false,
    tipo: sub.tipo ?? null,
    duracao_horas: sub.duracao_horas ?? null,
    ordem: sub.ordem ?? indice + 1,
    registro: sub.registro ?? 'VERIFICACAO',
    exige_foto: sub.exige_foto ?? false,
    unidade: leitura ? sub.unidade?.trim() || null : null,
    valor_minimo: leitura ? (sub.valor_minimo ?? null) : null,
    valor_maximo: leitura ? (sub.valor_maximo ?? null) : null,
  };
}

/** Os Decimal (faixa, duração) viram texto no JSON: a resposta leva número. */
export function passoParaResposta(passo: sub_instrucoes): SubInstrucaoResponseDto {
  return {
    id: passo.id,
    descricao: passo.descricao,
    obrigatoria: passo.obrigatoria,
    tipo: passo.tipo,
    duracao_horas: numeroOuNulo(passo.duracao_horas),
    ordem: passo.ordem,
    registro: passo.registro,
    exige_foto: passo.exige_foto,
    unidade: passo.unidade,
    valor_minimo: numeroOuNulo(passo.valor_minimo),
    valor_maximo: numeroOuNulo(passo.valor_maximo),
    created_at: passo.created_at,
    updated_at: passo.updated_at,
  };
}

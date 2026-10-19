import { BadRequestException } from '@nestjs/common';

/**
 * Criticidade do equipamento pela matriz impacto × probabilidade (SN-64).
 *
 * O impacto pesa o dobro: nível = (2 × impacto + probabilidade) ÷ 3,
 * arredondado (decisão do usuário, 19/out/2026). É a lógica usual de
 * criticidade em manutenção — a consequência manda: a falha rara que para a
 * usina fica Alta; a frequente que não afeta nada fica Baixa.
 *
 * A tabela está por extenso porque é o contrato. O front (AupusService,
 * `core/features/equipamentos/utils/criticidade-pela-matriz.ts`) tem a mesma
 * para sugerir na tela, e os testes dos dois lados conferem célula por célula.
 *
 * A matriz SUGERE: a pessoa pode gravar outro nível, e então o motivo é
 * obrigatório. Sem impacto e probabilidade (cadastro de antes do SN-64) não
 * há sugestão, e o nível vale como está.
 */
export const MATRIZ_DE_CRITICIDADE: readonly (readonly number[])[] = [
  //  probabilidade 1  2  3  4  5
  /* impacto 1 */ [1, 1, 2, 2, 2],
  /* impacto 2 */ [2, 2, 2, 3, 3],
  /* impacto 3 */ [2, 3, 3, 3, 4],
  /* impacto 4 */ [3, 3, 4, 4, 4],
  /* impacto 5 */ [4, 4, 4, 5, 5],
];

/**
 * A escala de antes do 1 a 5, com A a mais crítica. É a régua do cron
 * (`modules/tarefas/prioridade-pela-criticidade.ts`), da conversão do banco
 * (`prisma/sql/2026-10-19-criticidade-antiga.sql`) e da sincronização, que
 * converte o que chega do NexOn (`sincronizacao/transformacoes.ts`).
 */
export const ESCALA_ANTIGA: Readonly<Record<string, number>> = { A: 5, B: 3, C: 1 };

const ROTULOS: Record<string, string> = {
  '1': 'Muito baixa',
  '2': 'Baixa',
  '3': 'Média',
  '4': 'Alta',
  '5': 'Muito alta',
};

const NIVEIS = new Set(Object.keys(ROTULOS));

/** Texto aparado (vazio = nulo), como a comparação da planilha. */
const comparavel = (valor: unknown) => (typeof valor === 'string' ? valor.trim() || null : (valor ?? null));

export const LIMITE_DO_MOTIVO = 1000;

const ehNota = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 1 && (valor as number) <= 5;

/** O nível que a matriz sugere; null sem as duas notas. */
export function criticidadeSugerida(impacto: number | null | undefined, probabilidade: number | null | undefined): number | null {
  if (!ehNota(impacto) || !ehNota(probabilidade)) return null;
  return MATRIZ_DE_CRITICIDADE[impacto - 1][probabilidade - 1];
}

export interface CriticidadeDoEquipamento {
  criticidade?: string | null;
  criticidade_impacto?: number | null;
  criticidade_probabilidade?: number | null;
  criticidade_motivo?: string | null;
}

const CAMPOS = ['criticidade', 'criticidade_impacto', 'criticidade_probabilidade', 'criticidade_motivo'] as const;

/**
 * Confere a criticidade antes de gravar e devolve o motivo como deve ficar.
 *
 * `atual` é o que está no banco (vazio na criação); `mudanca`, o que chegou —
 * `undefined` é "não mexe", como no Prisma. A conta é sobre o resultado das
 * duas: quem troca só o nível de um equipamento avaliado também precisa do
 * motivo. Nenhum dos quatro campos MUDOU = nada a conferir: dado de antes não
 * trava a gravação de outro campo, nem quando o formulário reenvia os quatro
 * como estão (o NexOn pode ter trocado o nível de um equipamento avaliado: a
 * sincronização não passa por aqui).
 *
 * O motivo é o da diferença: sem diferença da matriz ele vira null, para não
 * ficar uma justificativa velha de um nível que já não diverge.
 */
export function conferirCriticidade(
  atual: CriticidadeDoEquipamento,
  mudanca: CriticidadeDoEquipamento,
): Pick<CriticidadeDoEquipamento, 'criticidade_motivo'> {
  const mudou = (campo: (typeof CAMPOS)[number]) => mudanca[campo] !== undefined && comparavel(mudanca[campo]) !== comparavel(atual[campo]);
  if (!CAMPOS.some(mudou)) return {};

  const final = Object.fromEntries(
    CAMPOS.map((campo) => [campo, mudanca[campo] !== undefined ? mudanca[campo] : (atual[campo] ?? null)]),
  ) as Required<CriticidadeDoEquipamento>;

  // O lote de componentes não passa pelo pipe: a régua do DTO é repetida aqui.
  // Só texto: número ou lista virariam "3" e 500 no Prisma; e o Set, não `in`,
  // para "constructor" não passar pela cadeia do objeto
  if (mudou('criticidade') && !(typeof mudanca.criticidade === 'string' && NIVEIS.has(mudanca.criticidade.trim()))) {
    throw new BadRequestException('A criticidade vai de 1 a 5.');
  }
  const nivel = typeof final.criticidade === 'string' ? final.criticidade.trim() : null;
  for (const [campo, nome] of [['criticidade_impacto', 'O impacto da falha'], ['criticidade_probabilidade', 'A probabilidade de falha']] as const) {
    const valor = final[campo];
    if (valor !== null && !ehNota(valor)) throw new BadRequestException(`${nome} vai de 1 a 5.`);
  }
  if ((final.criticidade_impacto === null) !== (final.criticidade_probabilidade === null)) {
    throw new BadRequestException('Informe o impacto e a probabilidade juntos, ou nenhum dos dois.');
  }

  const motivo = typeof final.criticidade_motivo === 'string' ? final.criticidade_motivo.trim() : '';
  if (motivo.length > LIMITE_DO_MOTIVO) {
    throw new BadRequestException(`O motivo da criticidade tem no máximo ${LIMITE_DO_MOTIVO} caracteres.`);
  }

  const sugerida = criticidadeSugerida(final.criticidade_impacto, final.criticidade_probabilidade);
  const diverge = sugerida !== null && nivel !== String(sugerida);
  if (diverge && !motivo) {
    throw new BadRequestException(
      `A matriz sugere ${sugerida} (${ROTULOS[sugerida]}) para impacto ${final.criticidade_impacto} e ` +
        `probabilidade ${final.criticidade_probabilidade}. Para gravar ${nivel ?? 'outro nível'}, informe o motivo.`,
    );
  }
  return { criticidade_motivo: diverge ? motivo : null };
}

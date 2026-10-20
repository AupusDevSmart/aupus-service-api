import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsISO8601, Matches } from 'class-validator';

/**
 * Ano de 1900 a 2199. Fora disso é o ano digitado errado, e o Prisma recusa o
 * Date fora de 0..9999 depois de passar para UTC: "9999-12-31" no fim de um
 * período vira o ano 10000 e dava 500 (revisão do SN-74).
 */
export const ANO = '(?:19|20|21)\\d{2}';

/** "AAAA-MM-DD", com o ano aceito */
export const FORMA_DO_DIA = new RegExp(`^${ANO}-\\d{2}-\\d{2}$`);

/**
 * O instante como o RFC 3339 o escreve (o que o `toISOString` da tela manda):
 * dia, hora com segundos e o fuso ("Z" ou "-03:00"). O ISO 8601 aceita mais —
 * semana ("2026-W42-5T10:00:00Z"), hora sem minutos ("2026-10-16T10Z") — e
 * o Date não lê nenhum dos dois: virava Invalid Date e dava 500 (SN-74).
 */
export const FORMA_DO_INSTANTE = new RegExp(`^${ANO}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$`);

const MENSAGEM = 'Use data e hora ISO com o fuso (ex.: 2026-10-16T13:05:00Z ou 2026-10-16T10:05:00-03:00), ano de 1900 a 2199.';

/**
 * Coluna NOT NULL num DTO de update: o `IsOptional` do PartialType pula o
 * null, que chegava ao Prisma (500) ou virava 1970 no `new Date(null)`. Vazio
 * e null viram '' e a validação recusa (400). Ausente continua ausente.
 */
export const obrigatorioMesmoNoUpdate = () =>
  Transform(({ value }) => (value === null || (typeof value === 'string' && value.trim() === '') ? '' : value));

/**
 * Um instante: data e hora ISO com o fuso escrito ("Z" ou "-03:00"). O
 * `@IsDateString` solto aceitava "2026-10-16T10:00" (lido no fuso do SERVIDOR:
 * 3 h de diferença entre o dev e a produção), "2026-02-30" (virava 2 de março)
 * e "2026-W42-5" (virava Invalid Date e dava 500). Revisão do SN-60; formato
 * fechado no SN-74.
 *
 * `obrigatorio`: a coluna é NOT NULL — null e vazio são recusados também no
 * update. O campo opcional continua precisando de `@IsOptional()`.
 */
export function InstanteComFuso({ obrigatorio = false }: { obrigatorio?: boolean } = {}) {
  return applyDecorators(
    ...(obrigatorio ? [obrigatorioMesmoNoUpdate()] : []),
    IsISO8601({ strict: true, strictSeparator: true }, { message: MENSAGEM }),
    Matches(FORMA_DO_INSTANTE, { message: MENSAGEM }),
  );
}

/**
 * Hora do dia "HH:mm" (de Brasília), a que o service junta ao dia. Só com o
 * tamanho conferido, "99:99" e "8h" passavam e o instante montado com elas
 * era Invalid Date: aprovar a programação dava 500 (revisão do SN-74). É a
 * regra do `validarJanela` das reservas. Vazio vira null (sem hora).
 */
export function HoraDoDia() {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value)),
    Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use a hora como HH:mm (ex.: 08:00).' }),
  );
}

/**
 * O começo ou o fim de um filtro de período: "AAAA-MM-DD" (o dia inteiro em
 * Brasília, pelo `periodoDoFiltro`) ou um instante com fuso. Fica como veio:
 * é o formato do texto que diz se é dia ou instante.
 */
export function DiaOuInstante() {
  const mensagem = 'Use a data como AAAA-MM-DD ou data e hora ISO com o fuso (ex.: 2026-10-16T13:05:00Z), ano de 1900 a 2199.';
  return applyDecorators(
    IsISO8601({ strict: true, strictSeparator: true }, { message: mensagem }),
    Matches(new RegExp(`${FORMA_DO_DIA.source}|${FORMA_DO_INSTANTE.source}`), { message: mensagem }),
  );
}

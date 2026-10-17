import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/**
 * Um instante: data e hora ISO com o fuso escrito ("Z" ou "-03:00"). O
 * `@IsDateString` solto aceitava "2026-10-16T10:00" (lido no fuso do SERVIDOR:
 * 3 h de diferença entre o dev e a produção), "2026-02-30" (virava 2 de março)
 * e "2026-W42-5" (virava Invalid Date e dava 500). Revisão do SN-60.
 */
export function InstanteComFuso() {
  return applyDecorators(
    IsISO8601({ strict: true, strictSeparator: true }, { message: 'Use data e hora ISO válidas (ex.: 2026-10-16T13:05:00Z).' }),
    Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'A data e hora precisam do fuso (ex.: 2026-10-16T13:05:00Z ou -03:00).' }),
  );
}

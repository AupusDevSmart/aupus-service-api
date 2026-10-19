import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsISO8601, Matches } from 'class-validator';

const SO_O_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" como a meia-noite UTC que o Prisma aceita num DateTime; o resto como veio. */
export const diaComoInstante = (texto: string) => (SO_O_DIA.test(texto) ? `${texto}T00:00:00.000Z` : texto);

/**
 * Uma data de calendário (coluna `@db.Date`): "AAAA-MM-DD", ou o ISO da
 * meia-noite UTC que a tela manda. O `@IsDateString` solto aceitava
 * "2027-01-15", e o Prisma recusa esse texto num DateTime — o 400 virava 500
 * (achado no SN-66). Aqui o dia vira a meia-noite UTC antes de chegar ao
 * service; vazio vira null (apagar a data). "2026-02-30" é recusado (strict).
 *
 * O campo continua precisando de `@IsOptional()` quando é opcional.
 */
export function DiaDeCalendario() {
  return applyDecorators(
    Transform(({ value }) => {
      if (typeof value !== 'string') return value;
      const texto = value.trim();
      if (texto === '') return null;
      return diaComoInstante(texto);
    }),
    IsISO8601({ strict: true }, { message: 'Use a data como AAAA-MM-DD (ex.: 2027-01-15).' }),
    // O ISO aceita semana ("2026-W42-5") e o formato sem traços, que o Date não lê
    Matches(/^\d{4}-\d{2}-\d{2}(T\S+)?$/, { message: 'Use a data como AAAA-MM-DD (ex.: 2027-01-15).' }),
  );
}

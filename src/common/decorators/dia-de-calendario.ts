import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDate, IsISO8601, Matches, isISO8601 } from 'class-validator';
import { ANO, FORMA_DO_DIA } from './instante';

const SO_O_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" como a meia-noite UTC que o Prisma aceita num DateTime; o resto como veio. */
export const diaComoInstante = (texto: string) => (SO_O_DIA.test(texto) ? `${texto}T00:00:00.000Z` : texto);

const MENSAGEM = 'Use a data como AAAA-MM-DD (ex.: 2027-01-15), ano de 1900 a 2199.';

/**
 * O dia, ou a meia-noite UTC que o sheet do componente manda. Outro instante
 * não: "2027-01-15T22:00:00-03:00" é 16/01 em UTC, e a coluna gravava o dia
 * seguinte ao que a pessoa quis (revisão do SN-74). Nenhuma tela manda outro.
 */
const MEIA_NOITE_UTC = new RegExp(`^${ANO}-\\d{2}-\\d{2}T00:00:00(\\.0{1,9})?Z$`);
const DIA_OU_MEIA_NOITE = new RegExp(`${FORMA_DO_DIA.source}|${MEIA_NOITE_UTC.source}`);

/**
 * A regra do decorator para quem não passa pelo pipe (o lote de componentes):
 * o dia como a meia-noite UTC, ou null se não for uma data de calendário
 * válida. O `Date.parse` de lá aceitava "2026-02-30" (virava 2 de março) e
 * "2026-10-16T10:00" sem fuso, que o Prisma recusava (500).
 */
export function lerDiaDeCalendario(texto: string): string | null {
  const valor = diaComoInstante(texto.trim());
  return DIA_OU_MEIA_NOITE.test(valor) && isISO8601(valor, { strict: true }) ? valor : null;
}

interface Opcoes {
  /**
   * A coluna é NOT NULL: vazio e null são recusados, também no update (o
   * `IsOptional` do PartialType pula o null, que chegava ao Prisma e dava 500,
   * ou virava 1970 no `new Date(null)`).
   */
  obrigatoria?: boolean;
  /**
   * Só "AAAA-MM-DD", entregue como texto: para o service que junta o dia com
   * a hora em Brasília (`instanteEmBrasilia`). Com o ISO completo, aquilo
   * montava "…ZT08:00:00-03:00" e dava 500.
   */
  comoTexto?: boolean;
}

/**
 * Uma data de calendário (coluna `@db.Date`): "AAAA-MM-DD", ou o ISO da
 * meia-noite UTC que a tela manda. O `@IsDateString` solto aceitava
 * "2027-01-15", e o Prisma recusa esse texto num DateTime — o 400 virava 500
 * (achado no SN-66). Aqui o dia vira a meia-noite UTC antes de chegar ao
 * service; vazio vira null (apagar a data). "2026-02-30" é recusado (strict).
 *
 * O campo opcional continua precisando de `@IsOptional()`.
 */
export function DiaDeCalendario({ obrigatoria = false, comoTexto = false }: Opcoes = {}) {
  return applyDecorators(
    Transform(({ value }) => {
      if (value === null) return obrigatoria ? '' : null;
      if (typeof value !== 'string') return value;
      const texto = value.trim();
      if (texto === '') return obrigatoria ? '' : null;
      return comoTexto ? texto : diaComoInstante(texto);
    }),
    IsISO8601({ strict: true }, { message: MENSAGEM }),
    // O ISO aceita semana ("2026-W42-5"), o formato sem traços e a hora sem
    // minutos, que o Date não lê
    Matches(comoTexto ? FORMA_DO_DIA : DIA_OU_MEIA_NOITE, { message: MENSAGEM }),
  );
}

/**
 * A data de calendário num campo que o service recebe como `Date` (feriado,
 * reserva, veículo). O `@Type(() => Date)` com `@IsDate` aceitava "2026-02-30"
 * (gravava 2 de março), "2026-10-16T10:00" (o dia no fuso do servidor) e o
 * número 20270115 (1970-01-01) — revisão do SN-74. Lê o valor como chegou
 * (`obj[key]`: a conversão implícita roda antes) pela regra do
 * `@DiaDeCalendario` e entrega a meia-noite UTC como `Date`.
 *
 * `obrigatoria`: null e vazio são recusados também no update. O campo
 * opcional continua precisando de `@IsOptional()`.
 */
export function DiaComoData({ obrigatoria = false }: Pick<Opcoes, 'obrigatoria'> = {}) {
  return applyDecorators(
    Transform(({ obj, key }) => {
      const bruto: unknown = (obj as Record<string, unknown>)[key];
      if (bruto === null || (typeof bruto === 'string' && bruto.trim() === '')) return obrigatoria ? '' : null;
      if (bruto === undefined) return undefined;
      if (typeof bruto !== 'string') return bruto instanceof Date ? bruto : String(bruto);
      const dia = lerDiaDeCalendario(bruto);
      // Inválido segue como texto, e o IsDate recusa (400)
      return dia ? new Date(dia) : bruto;
    }),
    IsDate({ message: MENSAGEM }),
  );
}

import { Transform } from 'class-transformer';

/**
 * Texto opcional: aparado, e o vazio vira null. Junto do `@IsOptional()`, o
 * campo que a tela manda em branco ("sem CNPJ por enquanto") não passa pelas
 * regras de formato e grava "sem valor", não um texto vazio — com a coluna
 * única (o CNPJ da planta), dois vazios colidiriam.
 */
export function TextoOpcional(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string') return value;
    const aparado = value.trim();
    return aparado === '' ? null : aparado;
  });
}

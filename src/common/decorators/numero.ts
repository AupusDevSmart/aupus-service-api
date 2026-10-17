import { Transform } from 'class-transformer';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * No máximo `casas` casas decimais. No lugar do `maxDecimalPlaces` do
 * IsNumber, que conta as casas pelo texto do número: em notação científica
 * ("1e-7", sem ponto) ele lança TypeError e o 400 vira 500; e "1.5e-7" passava
 * como 4 casas e o Decimal gravava 0. Aqui a conta é pelo valor: o número tem
 * de ser ele mesmo arredondado nas casas pedidas.
 */
export function CasasDecimais(casas: number, opcoes?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'casasDecimais',
      constraints: [casas],
      validator: {
        // Não número fica para o IsNumber dizer; aqui só as casas
        validate: (valor) => typeof valor !== 'number' || !Number.isFinite(valor) || Number(valor.toFixed(casas)) === valor,
        defaultMessage: () => `Use no máximo ${casas} casa${casas === 1 ? '' : 's'} decimai${casas === 1 ? 'l' : 's'}.`,
      },
    },
    opcoes,
  );
}

/**
 * O número como chegou, antes da conversão implícita do pipe global: texto
 * vazio é null (o `enableImplicitConversion` fazia Number("") = 0 e gravava
 * zero no lugar de "sem valor") e booleano vira NaN, que o IsNumber recusa
 * (true virava 1).
 */
export function VazioEhNulo() {
  return Transform(({ obj, key, value }) => {
    const bruto = (obj as Record<string, unknown>)[key];
    if (typeof bruto === 'string' && bruto.trim() === '') return null;
    if (typeof bruto === 'boolean') return Number.NaN;
    return value;
  });
}

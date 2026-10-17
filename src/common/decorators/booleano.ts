import { Transform } from 'class-transformer';

/**
 * Booleano que chega como texto (query string, multipart): "true" e "false".
 *
 * Lê o valor COMO CHEGOU. O pipe global tem `enableImplicitConversion`, que
 * converte antes do @Transform: "false" vira Boolean("false") = true, e o
 * `value === 'false'` dos Transforms que havia nos DTOs nunca casava — o
 * filtro "Específica" dos feriados trazia as gerais, "Exclui sábado" trazia
 * as que incluem. Por isso o `obj[key]`, e não o `value`.
 *
 * Vazio é ausente (não filtra); texto que não é booleano segue como veio e o
 * IsBoolean recusa (400), em vez de virar true ou false calado.
 */
export function BooleanoDoTexto() {
  return Transform(({ obj, key }) => {
    const bruto = (obj as Record<string, unknown>)[key];
    if (bruto === true || bruto === 'true' || bruto === '1') return true;
    if (bruto === false || bruto === 'false' || bruto === '0') return false;
    if (bruto === undefined || bruto === null || bruto === '') return undefined;
    return bruto;
  });
}

import { BadRequestException } from '@nestjs/common';
import { FORMA_DO_DIA } from '../../common/decorators/instante';

/** AAAA-MM-DD: o formato do período da agenda. */
export const FORMATO_DO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A data de calendário em Brasília (fuso fixo -03:00, como a regra de dias
 * úteis), no começo ou no fim do dia. Confere o dia de volta: "2026-02-31" o
 * Date aceitaria como 3 de março. O ano vai de 1900 a 2199: o fim de
 * "9999-12-31" em UTC é o ano 10000, que o Prisma recusa (500).
 */
export function diaDoCalendario(dia: string, fimDoDia = false): Date {
  if (!FORMA_DO_DIA.test(dia)) throw new BadRequestException(`Data inválida: ${dia} (AAAA-MM-DD, ano de 1900 a 2199)`);
  const data = new Date(`${dia}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}-03:00`);
  const deVolta = Number.isNaN(data.getTime()) ? null : new Date(data.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  if (deVolta !== dia) throw new BadRequestException(`Data inválida: ${dia}`);
  return data;
}

/** O período pedido, conferido: datas válidas, fim depois do início e no máximo `dias`. */
export function periodoDaAgenda(inicio: string, fim: string, dias: number): { inicio: Date; fim: Date } {
  const de = diaDoCalendario(inicio);
  const ate = diaDoCalendario(fim, true);
  if (ate.getTime() < de.getTime()) throw new BadRequestException('O fim vem antes do início');
  if (ate.getTime() - de.getTime() > dias * 86_400_000) throw new BadRequestException(`O período vai até ${dias} dias`);
  return { inicio: de, fim: ate };
}

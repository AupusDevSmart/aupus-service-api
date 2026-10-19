import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsOptional } from 'class-validator';
import { DiaDeCalendario } from './dia-de-calendario';

/** O "AAAA-MM-DD" passava pelo @IsDateString e o Prisma recusava no DateTime: 500 (SN-66). */
class Pedido {
  @IsOptional()
  @DiaDeCalendario()
  garantia_ate?: string | null;
}

// O pipe do app (configurar-app.ts)
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const ler = (garantia_ate: unknown) => pipe.transform({ garantia_ate }, { type: 'body', metatype: Pedido }) as Promise<Pedido>;

describe('@DiaDeCalendario', () => {
  it.each([
    ['2027-01-15', '2027-01-15T00:00:00.000Z'],
    [' 2027-01-15 ', '2027-01-15T00:00:00.000Z'],
    // O que a tela manda
    ['2027-01-15T00:00:00.000Z', '2027-01-15T00:00:00.000Z'],
  ])('aceita %j e entrega a meia-noite UTC', async (entrada, saida) => {
    expect((await ler(entrada)).garantia_ate).toBe(saida);
  });

  it('vazio e null apagam a data', async () => {
    expect((await ler('')).garantia_ate).toBeNull();
    expect((await ler(null)).garantia_ate).toBeNull();
  });

  it.each([['2026-02-30'], ['15/01/2027'], ['2026-W42-5'], [20270115]])('recusa %j com 400', async (entrada) => {
    await expect(ler(entrada)).rejects.toBeInstanceOf(BadRequestException);
  });
});

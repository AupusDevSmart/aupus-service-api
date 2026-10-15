import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateConcessionariaDto } from './create-concessionaria.dto';
import { UpdateConcessionariaDto } from './update-concessionaria.dto';

/**
 * As tarifas aninhadas são validadas (SN-11). Antes faltava @ValidateNested e
 * @Type: qualquer valor passava — negativo, texto, chave inventada. Mesmo pipe
 * do main.ts (whitelist + forbidNonWhitelisted + conversão implícita).
 */
describe('CreateConcessionariaDto: tarifas e horários', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const base = { nome: 'Equatorial', estado: 'GO', data_inicio: '2026-01-01', data_validade: '2026-12-31' };
  const validar = (corpo: Record<string, unknown>, metatype: typeof CreateConcessionariaDto | typeof UpdateConcessionariaDto = CreateConcessionariaDto) =>
    pipe.transform({ ...base, ...corpo }, { type: 'body', metatype });

  it('tarifa negativa: 400', async () => {
    await expect(validar({ a4_verde: { tusd_d: -1 } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tarifa que não é número: 400', async () => {
    await expect(validar({ b: { tusd_valor: 'abc' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chave inventada dentro da tarifa: 400', async () => {
    await expect(validar({ a3a_verde: { tusd_d: 1, inventada: 2 } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tarifa 0 é aceita (a TE de demanda costuma ser 0)', async () => {
    await expect(validar({ a4_verde: { te_d: 0 } })).resolves.toMatchObject({ a4_verde: { te_d: 0 } });
  });

  it('a tarifa em texto, como a API devolve o Decimal, vira número e passa', async () => {
    const dto = (await validar({ a4_verde: { tusd_d: '15.5' } })) as CreateConcessionariaDto;
    expect(dto.a4_verde?.tusd_d).toBe(15.5);
  });

  it('no update também', async () => {
    await expect(validar({ b: { te_valor: -0.1 } }, UpdateConcessionariaDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lista no lugar do grupo de tarifas: 400 (passava e o 200 não gravava nada)', async () => {
    await expect(validar({ a4_verde: [{ tusd_d: 1 }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tarifa acima do que a coluna Decimal(10,6) guarda: 400, e não 500 do banco', async () => {
    await expect(validar({ b: { te_valor: 10000 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar({ b: { te_valor: 9999.999999 } })).resolves.toBeDefined();
  });

  it('horário fora de 0..24: 400', async () => {
    await expect(validar({ hora_inicio_ponta: 25 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

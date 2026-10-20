import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '@/core';
import { AgendaService } from './agenda.service';
import { ProximosDiasUteisDto, VerificarDiaUtilDto } from './dto';

/**
 * Verificar dia útil e próximos dias úteis pela query (SN-74). As rotas liam a
 * query crua (uma interface, que o pipe não confere) e faziam `new Date`:
 * "2026-02-30" virava 2 de março, e `quantidade` sem teto fazia o laço andar
 * até dez vezes o pedido. Com o DTO: data conferida e teto de 366.
 */
describe('dias úteis pela query', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
  const ler = <T extends object>(metatype: new () => T, query: Record<string, string>) =>
    pipe.transform({ ...query }, { type: 'query', metatype }) as Promise<T>;

  it('a data vira a meia-noite UTC do dia pedido; outra forma é 400', async () => {
    expect((await ler(VerificarDiaUtilDto, { data: '2026-10-19' })).data).toEqual(new Date('2026-10-19T00:00:00.000Z'));
    for (const data of ['2026-02-30', '19/10/2026', '2026-W42-5', '']) {
      await expect(ler(VerificarDiaUtilDto, { data })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('quantidade inteira de 1 a 366', async () => {
    expect((await ler(ProximosDiasUteisDto, { quantidade: '5' })).quantidade).toBe(5);
    for (const quantidade of ['0', '367', '100000000', '2.5', 'muitos']) {
      await expect(ler(ProximosDiasUteisDto, { quantidade })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  describe('próximos dias úteis (banco real)', () => {
    const prisma = new PrismaService();
    const agenda = new AgendaService(prisma);
    afterAll(() => prisma.$disconnect());

    // `dataInicio = new Date()` na desestruturação não vale para null: partia de 1970
    it('dataInicio vazio é hoje, não 1970', async () => {
      const dto = await ler(ProximosDiasUteisDto, { quantidade: '1', dataInicio: '' });
      const resposta = await agenda.obterProximosDiasUteis(dto);
      expect(resposta.dataInicio.getUTCFullYear()).toBe(new Date().getUTCFullYear());
      expect(resposta.diasUteis[0].getUTCFullYear()).toBeGreaterThanOrEqual(new Date().getUTCFullYear());
    });
  });
});

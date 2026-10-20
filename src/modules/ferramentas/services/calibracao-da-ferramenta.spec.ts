import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { FerramentasService } from './ferramentas.service';

/**
 * Ferramenta que precisa de calibração tem a próxima data (revisão do SN-74).
 * O update só olhava o `necessita_calibracao` do corpo: apagar a data sem
 * mandá-lo gravava NULL calado (a ferramenta saía dos alertas de calibração),
 * e mandar só `necessita_calibracao: true` recusava a data já gravada. Agora a
 * regra é pelo estado que fica gravado. Contra Postgres real.
 */
describe('ferramenta: próxima calibração no update (banco real)', () => {
  const prisma = new PrismaService();
  const service = new FerramentasService(prisma);

  const ID = (s: string) => `testecalibferr${s}`.padEnd(25, '0').slice(0, 25);
  const USUARIO = ID('usuario');
  const FERRAMENTA = ID('ferramenta');

  const apagar = async () => {
    await prisma.ferramentas.deleteMany({ where: { id: FERRAMENTA } });
    await prisma.usuarios.deleteMany({ where: { id: USUARIO } });
  };

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: USUARIO, nome: 'Responsável', email: `${USUARIO}@calibracao.teste` } });
    await prisma.ferramentas.create({
      data: {
        id: FERRAMENTA, organizacao_nome: 'TESTE-CALIBRACAO', nome: 'Multímetro', codigo_patrimonial: 'TESTE-CAL-01', fabricante: 'x', modelo: 'x',
        numero_serie: 'x', necessita_calibracao: true, proxima_data_calibracao: new Date('2027-03-01T00:00:00.000Z'), localizacao_atual: 'x',
        responsavel_id: USUARIO, data_aquisicao: new Date('2024-01-10T00:00:00.000Z'), criado_por: USUARIO,
      },
    });
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const proxima = async () =>
    (await prisma.ferramentas.findUniqueOrThrow({ where: { id: FERRAMENTA }, select: { proxima_data_calibracao: true } })).proxima_data_calibracao?.toISOString() ?? null;

  it('apagar a data de quem precisa de calibração é 400, e a data fica', async () => {
    await expect(service.update(FERRAMENTA, { proxima_data_calibracao: null }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    expect(await proxima()).toBe('2027-03-01T00:00:00.000Z');
  });

  it('confirmar que precisa, sem mandar a data, mantém a gravada', async () => {
    await service.update(FERRAMENTA, { necessita_calibracao: true }, USUARIO);
    expect(await proxima()).toBe('2027-03-01T00:00:00.000Z');
  });

  it('deixar de precisar libera apagar a data', async () => {
    await service.update(FERRAMENTA, { necessita_calibracao: false, proxima_data_calibracao: null }, USUARIO);
    expect(await proxima()).toBeNull();
  });
});

import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { FeriadosService } from './feriados.service';

/**
 * Os filtros da lista de feriados (SN-56), contra Postgres real: a busca não
 * some quando se escolhe a planta, o mês termina no último dia dele, e o
 * feriado recorrente vale em todo ano (fica gravado com o ano do cadastro).
 */
describe('filtros dos feriados (banco real)', () => {
  const prisma = new PrismaService();
  const feriados = new FeriadosService(prisma);
  const PREFIXO = 'TESTE-FERFILTRO';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

  const apagar = async () => {
    const ids = (await prisma.feriados.findMany({ where: { nome: { startsWith: PREFIXO } }, select: { id: true } })).map((f) => f.id);
    await prisma.feriado_plantas.deleteMany({ where: { feriado_id: { in: ids } } });
    await prisma.feriados.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    planta = await criarPlantaDeTeste(prisma, 'ferfiltro', '84.300.000/0001-01');
    await apagar();
    const criar = (nome: string, data: string, dados: Record<string, unknown> = {}) =>
      prisma.feriados.create({ data: { nome: `${PREFIXO} ${nome}`, data: dia(data), tipo: 'NACIONAL', geral: true, recorrente: false, ...dados } });
    await criar('Natal', '2024-12-25', { recorrente: true });
    await criar('Tiradentes', '2026-04-21');
    await criar('Trabalho', '2026-05-01');
    const local = await criar('Local', '2026-04-10', { geral: false, tipo: 'MUNICIPAL' });
    await prisma.feriado_plantas.create({ data: { feriado_id: local.id, planta_id: planta.id } });
  });

  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const nomes = async (filtro: Record<string, unknown>) =>
    (await feriados.buscarTodos({ page: 1, limit: 100, search: PREFIXO, ...filtro } as never)).data.map((f) => f.nome.replace(`${PREFIXO} `, '')).sort();

  it('a busca continua valendo com a planta escolhida (o OR da planta apagava o da busca)', async () => {
    expect(await nomes({ search: `${PREFIXO} Local`, plantaId: planta.id.trim() })).toEqual(['Local']);
    expect(await nomes({ plantaId: planta.id.trim() })).toEqual(['Local', 'Natal', 'Tiradentes', 'Trabalho']);
  });

  it('abril vai até o dia 30 (o dia 31 fixo levava até 01/05)', async () => {
    expect(await nomes({ ano: 2026, mes: 4 })).toEqual(['Local', 'Tiradentes']);
  });

  it('o recorrente vale em todo ano: o Natal de 2024 aparece em dezembro de 2026 e no ano de 2026', async () => {
    expect(await nomes({ ano: 2026, mes: 12 })).toEqual(['Natal']);
    expect(await nomes({ ano: 2026 })).toEqual(['Local', 'Natal', 'Tiradentes', 'Trabalho']);
    expect(await nomes({ ano: 2026, mes: 6 })).toEqual([]);
  });

  it('mês sem ano é recusado, em vez de ignorado calado', async () => {
    await expect(nomes({ mes: 12 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

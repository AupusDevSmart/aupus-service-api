import { ForbiddenException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { EquipamentosService } from '../equipamentos/equipamentos.service';
import { equipamentoNasPlantas, plantaDeCadaEquipamento } from './planta-dos-equipamentos';

/**
 * A planta de um equipamento sai da unidade (SN-12). `equipamentos.planta_id`
 * é da estrutura antiga: o lote de UAR gravava ali a planta do momento, e ela
 * ficava velha quando o UC mudava de planta — e vinha antes da unidade, então
 * escopo e planta da OS seguiam a planta errada. Fica só como último recurso,
 * no cálculo da planta e nos filtros de escopo das listas.
 */
describe('planta dos equipamentos (banco real)', () => {
  const prisma = new PrismaService();
  const equipamentos = new EquipamentosService(prisma, new PermissionScopeService(prisma));
  // 25 caracteres, como os ids cuid antigos, para provar o trim nas junções
  const ID = (s: string) => `testeplantaeq${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_VELHA = ID('donovelha');
  const DONO_NOVA = ID('dononova');
  const PLANTA_VELHA = ID('velha');
  const PLANTA_NOVA = ID('nova');
  const UNIDADE_NOVA = ID('unidade');
  const UC = ID('uc');
  const UAR = ID('uar');
  const SOLTO = ID('solto');
  const clienteDaNova = { id: DONO_NOVA, role: 'proprietario' };
  const clienteDaVelha = { id: DONO_VELHA, role: 'proprietario' };

  const apagar = async () => {
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR, SOLTO] } } });
    await prisma.equipamentos.deleteMany({ where: { id: UC } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE_NOVA } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_VELHA, PLANTA_NOVA] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_VELHA, DONO_NOVA] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `Planta ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });

  beforeAll(async () => {
    await apagar();
    for (const dono of [DONO_VELHA, DONO_NOVA]) {
      await prisma.usuarios.create({ data: { id: dono, nome: 'Dono', email: `${dono}@planta-eq.teste` } });
    }
    await planta(PLANTA_VELHA, DONO_VELHA, '83.000.000/0001-01');
    await planta(PLANTA_NOVA, DONO_NOVA, '83.000.000/0001-02');
    await prisma.unidades.create({ data: { id: UNIDADE_NOVA, planta_id: PLANTA_NOVA, nome: 'Unidade', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    // UC que mudou para a planta nova e ficou com a coluna antiga apontando para a velha
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_NOVA, planta_id: PLANTA_VELHA } });
    // Componente criado em lote quando o UC ainda era da planta velha
    await prisma.equipamentos.create({ data: { id: UAR, nome: 'Ventoinha', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC, planta_id: PLANTA_VELHA } });
    await prisma.equipamentos.create({ data: { id: SOLTO, nome: 'Antigo', classificacao: 'UC', criticidade: '3', planta_id: PLANTA_VELHA } });
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('o componente segue a planta da unidade do UC, não o planta_id antigo', async () => {
    expect((await plantaDeCadaEquipamento(prisma, [UAR])).get(UAR)).toBe(PLANTA_NOVA);
  });

  it('equipamento sem unidade ainda usa o planta_id antigo', async () => {
    expect((await plantaDeCadaEquipamento(prisma, [SOLTO])).get(SOLTO)).toBe(PLANTA_VELHA);
  });

  it('o filtro das listas segue a mesma regra', async () => {
    const nas = async (plantas: string[]) =>
      (await prisma.equipamentos.findMany({ where: { AND: [{ id: { in: [UC, UAR, SOLTO] } }, equipamentoNasPlantas(plantas)] }, select: { id: true } }))
        .map((e) => e.id.trim())
        .sort();

    expect(await nas([PLANTA_NOVA])).toEqual([UAR, UC].sort());
    expect(await nas([PLANTA_VELHA])).toEqual([SOLTO]);
  });

  it('o componente abre para o cliente da planta do UC e não para o da planta antiga', async () => {
    await expect(equipamentos.findOne(UAR, clienteDaNova)).resolves.toMatchObject({ nome: 'Ventoinha' });
    await expect(equipamentos.findOne(UAR, clienteDaVelha)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a lista de equipamentos mostra o componente e o equipamento sem unidade de quem é a planta', async () => {
    const ids = async (cliente: typeof clienteDaNova) =>
      (await equipamentos.findAll({ limit: 100, search: 'testeplantaeq' } as never, cliente)).data.map((e) => e.id.trim()).sort();
    await prisma.equipamentos.updateMany({ where: { id: { in: [UC, UAR, SOLTO] } }, data: { tag: 'testeplantaeq' } });

    expect(await ids(clienteDaNova)).toEqual([UAR, UC].sort());
    expect(await ids(clienteDaVelha)).toEqual([SOLTO]);
  });

  it('a lista de UCs não mostra à planta antiga o UC que mudou de planta', async () => {
    const ids = async (cliente: typeof clienteDaNova) =>
      (await equipamentos.findEquipamentosUC(cliente)).map((e) => e.id.trim()).filter((id) => [UC, SOLTO].includes(id));

    expect(await ids(clienteDaNova)).toEqual([UC]);
    expect(await ids(clienteDaVelha)).toEqual([SOLTO]);
  });
});

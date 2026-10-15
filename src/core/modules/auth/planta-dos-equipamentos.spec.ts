import { PrismaService } from '@/core';
import { plantaDeCadaEquipamento } from './planta-dos-equipamentos';

/**
 * A planta de um equipamento sai da unidade (SN-12). `equipamentos.planta_id`
 * é da estrutura antiga: o lote de UAR gravava ali a planta do momento, e ela
 * ficava velha quando o UC mudava de planta — e vinha antes da unidade, então
 * escopo e planta da OS seguiam a planta errada. Fica só como último recurso.
 */
describe('plantaDeCadaEquipamento (banco real)', () => {
  const prisma = new PrismaService();
  // 25 caracteres, como os ids cuid antigos, para provar o trim nas junções
  const ID = (s: string) => `testeplantaeq${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA_VELHA = ID('velha');
  const PLANTA_NOVA = ID('nova');
  const UNIDADE_NOVA = ID('unidade');
  const UC = ID('uc');
  const UAR = ID('uar');
  const SOLTO = ID('solto');

  const apagar = async () => {
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR, SOLTO] } } });
    await prisma.equipamentos.deleteMany({ where: { id: UC } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE_NOVA } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_VELHA, PLANTA_NOVA] } } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };

  const planta = (id: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `Planta ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono', email: `${DONO}@planta-eq.teste` } });
    await planta(PLANTA_VELHA, '94.000.000/0001-01');
    await planta(PLANTA_NOVA, '94.000.000/0001-02');
    await prisma.unidades.create({ data: { id: UNIDADE_NOVA, planta_id: PLANTA_NOVA, nome: 'Unidade', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_NOVA } });
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
});

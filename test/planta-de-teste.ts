import type { PrismaService } from '../src/core';

/**
 * Uma planta (com o dono) para os specs que precisam de uma planta qualquer:
 * toda programação tem planta (SN-35), e o spec que só testa a OS não tem por
 * que montar unidade e equipamento. Cada spec usa o seu `nome` e o seu `cnpj`,
 * para não apagar a planta do outro.
 */
export async function criarPlantaDeTeste(prisma: PrismaService, nome: string, cnpj: string) {
  const idDe = (prefixo: string) => `${prefixo}${nome}`.toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(26, '0').slice(0, 26);
  const id = idDe('planta');
  const dono = idDe('dono');

  const apagar = async () => {
    await prisma.plantas.deleteMany({ where: { id } });
    await prisma.usuarios.deleteMany({ where: { id: dono } });
  };

  await apagar();
  await prisma.usuarios.create({ data: { id: dono, nome: `Dono ${nome}`, email: `${dono}@planta.teste` } });
  await prisma.plantas.create({
    data: {
      id,
      nome: `Planta ${nome}`,
      cnpj,
      localizacao: 'x',
      horario_funcionamento: '08-18',
      logradouro: 'Rua',
      cidade: 'Goiânia',
      uf: 'GO',
      cep: '74000-000',
      proprietario_id: dono,
    },
  });
  return { id, apagar };
}

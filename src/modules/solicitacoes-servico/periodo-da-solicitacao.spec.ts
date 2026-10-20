import { BadRequestException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';

/**
 * O filtro de período das solicitações é o das OS (SN-74): "AAAA-MM-DD" é o
 * dia inteiro em Brasília. Com o `new Date` direto, o fim era a meia-noite
 * UTC — a do último dia à tarde ficava de fora — e o começo pegava a da noite
 * anterior. Contra Postgres real.
 */
describe('solicitações: filtro de período em Brasília (banco real)', () => {
  const prisma = new PrismaService();
  const service = new SolicitacoesServicoService(prisma, new PermissionScopeService(prisma), new PropostaService(prisma));

  const ID = (s: string) => `testesolperiodo${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA = ID('planta');
  const PREFIXO = 'TESTE-SOL-PERIODO';
  const admin = { id: ID('admin'), role: 'admin' };

  const apagar = async () => {
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: PREFIXO } } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };

  const solicitacao = (sufixo: string, quando: string) =>
    prisma.solicitacoes_servico.create({
      data: {
        numero: `${PREFIXO}-${sufixo}`, titulo: `${PREFIXO} ${sufixo}`, descricao: 'x', tipo: 'INSPECAO',
        planta_id: PLANTA, solicitante_nome: 'x', local: 'x', data_solicitacao: new Date(quando),
      },
    });

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono', email: `${DONO}@sol-periodo.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: `${PREFIXO} planta`, cnpj: '74.000.000/0001-01', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    await solicitacao('VESPERA', '2026-09-30T22:00:00-03:00'); // 01:00 UTC do dia 1º
    await solicitacao('PRIMEIRO', '2026-10-01T00:30:00-03:00');
    await solicitacao('ULTIMO', '2026-10-31T20:00:00-03:00'); // o fim antigo (meia-noite UTC do dia 31) a deixava de fora
    await solicitacao('SEGUINTE', '2026-11-01T08:00:00-03:00');
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const numeros = async (filtros: Record<string, string>) => {
    const lista = await service.findAll({ search: PREFIXO, limit: 50, ...filtros }, admin);
    return lista.data.map((s) => s.numero.replace(`${PREFIXO}-`, '')).sort();
  };

  it('outubro em Brasília: do dia 1º à 00h30 ao dia 31 às 20h, nem a véspera nem o dia seguinte', async () => {
    expect(await numeros({ data_inicio: '2026-10-01', data_fim: '2026-10-31' })).toEqual(['PRIMEIRO', 'ULTIMO']);
  });

  it('instante com fuso vale como veio', async () => {
    expect(await numeros({ data_inicio: '2026-10-31T19:00:00-03:00' })).toEqual(['SEGUINTE', 'ULTIMO']);
  });

  it('fim antes do começo é 400, não lista vazia', async () => {
    await expect(numeros({ data_inicio: '2026-10-31', data_fim: '2026-10-01' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

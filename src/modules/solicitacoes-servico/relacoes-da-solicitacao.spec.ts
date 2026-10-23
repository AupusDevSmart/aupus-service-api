import { PermissionScopeService, PrismaService } from '@/core';
import { comAsRelacoes, type RelacoesDaSolicitacao } from './lugar-da-solicitacao';
import { PropostaService } from './proposta.service';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';

/**
 * O lugar da solicitação é gravado aparado (SN-77). Com id antigo de 25
 * caracteres no Char(26), o `include` do Prisma — que casa a relação em
 * JavaScript, com o espaço — voltava null: a resposta saía sem equipamento,
 * unidade e proprietário, e a programação criada da solicitação, com "N/A" no
 * ativo. Achado na revisão da integração do NexON (22/out/2026). Banco real.
 */
describe('relações da solicitação com id antigo (banco real)', () => {
  const prisma = new PrismaService();
  const service = new SolicitacoesServicoService(prisma, new PermissionScopeService(prisma), new PropostaService(prisma));

  // 25 caracteres, como os ids cuid antigos
  const ID = (s: string) => `testesolrel${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA = ID('planta');
  const UNIDADE = ID('unidade');
  const EQUIPAMENTO = ID('equip');
  const PREFIXO = 'TESTE-SOL-RELACOES';
  let solicitacaoId: string;

  const apagar = async () => {
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: EQUIPAMENTO } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono relações', email: `${DONO}@sol-relacoes.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: `${PREFIXO} planta`, cnpj: '90.000.000/0001-07', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: PLANTA, nome: `${PREFIXO} usina`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.equipamentos.create({ data: { id: EQUIPAMENTO, nome: 'Inversor relações', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    // Como o formulário e o NexON gravam (comOLugarAparado): sem o espaço do Char(26)
    solicitacaoId = (
      await prisma.solicitacoes_servico.create({
        data: {
          numero: `${PREFIXO}-1`,
          titulo: PREFIXO,
          descricao: 'x',
          tipo: 'INSPECAO',
          planta_id: PLANTA,
          unidade_id: UNIDADE,
          equipamento_id: EQUIPAMENTO,
          proprietario_id: DONO,
          solicitante_id: DONO,
          solicitante_nome: 'Dono relações',
          local: 'x',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('o include do Prisma perde o equipamento de id antigo gravado aparado (o motivo da consulta própria)', async () => {
    const lida = await prisma.solicitacoes_servico.findUnique({ where: { id: solicitacaoId }, include: { equipamento: true } });
    expect(lida?.equipamento_id).toBe(EQUIPAMENTO);
    expect(lida?.equipamento).toBeNull();
  });

  it('comAsRelacoes acha equipamento, unidade, proprietário e solicitante pelo id aparado', async () => {
    const lida = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: solicitacaoId } });
    const [comRelacoes] = await comAsRelacoes(prisma, [lida]);
    expect(comRelacoes.equipamento).toMatchObject({ id: EQUIPAMENTO, nome: 'Inversor relações', unidade_id: `${UNIDADE} ` });
    expect(comRelacoes.unidade).toMatchObject({ id: UNIDADE, nome: `${PREFIXO} usina` });
    expect(comRelacoes.proprietario).toMatchObject({ id: DONO, nome: 'Dono relações' });
    expect(comRelacoes.solicitante).toMatchObject({ id: DONO });
  });

  it('o detalhe e a lista respondem com o equipamento, a unidade e o proprietário', async () => {
    const detalhe = (await service.findOne(solicitacaoId)) as unknown as RelacoesDaSolicitacao;
    expect(detalhe.equipamento?.nome).toBe('Inversor relações');
    expect(detalhe.unidade?.nome).toBe(`${PREFIXO} usina`);
    expect(detalhe.proprietario?.nome).toBe('Dono relações');
    expect(detalhe.solicitante?.nome).toBe('Dono relações');

    const { data } = await service.findAll({ search: PREFIXO, page: 1, limit: 10 });
    const daLista = data.find((s) => s.id.trim() === solicitacaoId.trim()) as unknown as RelacoesDaSolicitacao;
    expect(daLista.equipamento?.nome).toBe('Inversor relações');
    expect(daLista.unidade?.nome).toBe(`${PREFIXO} usina`);
    expect(daLista.proprietario?.nome).toBe('Dono relações');
  });
});

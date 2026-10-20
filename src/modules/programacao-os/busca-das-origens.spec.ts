import { PermissionScopeService, PrismaService } from '@/core';
import { AnomaliasService } from '../anomalias/anomalias.service';
import { PlanosManutencaoService } from '../planos-manutencao/planos-manutencao.service';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import { PropostaService } from '../solicitacoes-servico/proposta.service';
import { SolicitacoesServicoService } from '../solicitacoes-servico/solicitacoes-servico.service';

/**
 * A busca das origens da programação (SN-77). O seletor carregava 100 de cada
 * e filtrava no navegador: a 101ª não aparecia. Agora pagina e busca no
 * servidor — e a busca tem de alcançar o que a linha da lista mostra:
 * equipamento, instalação e planta (o plano só buscava no nome dele, a
 * anomalia e a solicitação não buscavam na planta). Contra Postgres real.
 */
describe('busca das origens da programação (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const planos = new PlanosManutencaoService(prisma, escopo, new PropagacaoPlanosService(prisma));
  const anomalias = new AnomaliasService(prisma, escopo);
  const solicitacoes = new SolicitacoesServicoService(prisma, escopo, new PropostaService(prisma));

  const ID = (s: string) => `testebuscaorig${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA = ID('planta');
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const UAR = ID('uar');
  const PREFIXO = 'TESTE-BUSCA-ORIGEM';
  const admin = { id: DONO, role: 'admin' };

  const apagar = async () => {
    const lista = await prisma.anomalias.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } });
    await prisma.historico_anomalias.deleteMany({ where: { anomalia_id: { in: lista.map((a) => a.id) } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: PREFIXO } } });
    await prisma.planos_manutencao.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: UAR } });
    await prisma.equipamentos.deleteMany({ where: { id: UC } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono', email: `${DONO}@busca-origem.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: 'Usina Zéfiro Teste', cnpj: '74.000.000/0001-03', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    await prisma.unidades.create({ data: { id: UNIDADE, planta_id: PLANTA, nome: 'Subestação Quíron', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor Ômega 7', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    await prisma.equipamentos.create({ data: { id: UAR, nome: 'Ventoinha', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC } });
    await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} preventiva`, equipamento_id: UC } });
    // A do componente (sem unidade própria): a instalação é a do UC pai
    await prisma.anomalias.create({ data: { descricao: `${PREFIXO} ruído`, local: 'x', ativo: 'x', origem: 'OPERADOR', planta_id: PLANTA, equipamento_id: UAR } });
    await prisma.solicitacoes_servico.create({
      data: { numero: `${PREFIXO}-1`, titulo: 'Troca de cabo', descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA, unidade_id: UNIDADE, solicitante_nome: 'Hipólita Teste', local: 'x' },
    });
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const nomesDosPlanos = async (search: string) =>
    (await planos.listar({ page: 1, limit: 20, vinculados: true, search }, admin)).data.map((p) => p.nome);
  const anomaliasAchadas = async (search: string) =>
    (await anomalias.findAll({ page: 1, limit: 20, search }, admin)).data.map((a) => a.descricao);
  const solicitacoesAchadas = async (search: string) =>
    (await solicitacoes.findAll({ page: 1, limit: 20, search }, admin)).data.map((s) => s.numero);

  it('plano: pelo equipamento, pela instalação e pela planta', async () => {
    for (const termo of ['ômega 7', 'quíron', 'zéfiro']) expect(await nomesDosPlanos(termo)).toEqual([`${PREFIXO} preventiva`]);
  });

  it('anomalia: pela planta e pela instalação do UC pai', async () => {
    for (const termo of ['zéfiro', 'quíron']) expect(await anomaliasAchadas(termo)).toEqual([`${PREFIXO} ruído`]);
  });

  it('solicitação: pelo solicitante, pela planta e pela instalação', async () => {
    for (const termo of ['hipólita', 'zéfiro', 'quíron']) expect(await solicitacoesAchadas(termo)).toEqual([`${PREFIXO}-1`]);
  });
});

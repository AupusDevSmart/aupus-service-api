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
  const ANTIGO = ID('antigo');
  const PREFIXO = 'TESTE-BUSCA-ORIGEM';
  const admin = { id: DONO, role: 'admin' };

  const apagar = async () => {
    const lista = await prisma.anomalias.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } });
    await prisma.historico_anomalias.deleteMany({ where: { anomalia_id: { in: lista.map((a) => a.id) } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: PREFIXO } } });
    await prisma.planos_manutencao.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR, ANTIGO] } } });
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
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor Ômega 7', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE, tipo_equipamento: 'Fotovoltaico Ípsilon' } });
    await prisma.equipamentos.create({ data: { id: UAR, nome: 'Ventoinha', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC } });
    // O equipamento antigo: só a coluna da planta, sem unidade
    await prisma.equipamentos.create({ data: { id: ANTIGO, nome: 'Bomba antiga', classificacao: 'UC', criticidade: '3', planta_id: PLANTA } });
    await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} preventiva`, equipamento_id: UC } });
    await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} componente`, equipamento_id: UAR } });
    await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} antigo`, equipamento_id: ANTIGO } });
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

  it('plano: pelo equipamento, pela categoria, pela instalação e pela planta — também o do componente e o do equipamento antigo', async () => {
    for (const termo of ['ômega 7', 'ípsilon']) expect(await nomesDosPlanos(termo)).toEqual([`${PREFIXO} preventiva`]);
    // O componente é da instalação do UC pai; o antigo, da planta da coluna
    expect((await nomesDosPlanos('quíron')).sort()).toEqual([`${PREFIXO} componente`, `${PREFIXO} preventiva`]);
    expect((await nomesDosPlanos('zéfiro')).sort()).toEqual([`${PREFIXO} antigo`, `${PREFIXO} componente`, `${PREFIXO} preventiva`]);
  });

  it('a linha do plano do componente e do antigo diz onde ele está', async () => {
    const lista = (await planos.listar({ page: 1, limit: 20, vinculados: true, search: 'zéfiro' }, admin)).data;
    const doComponente = lista.find((p) => p.nome === `${PREFIXO} componente`)?.equipamento as { equipamento_pai?: { unidade?: { nome?: string } } } | undefined;
    const doAntigo = lista.find((p) => p.nome === `${PREFIXO} antigo`)?.equipamento as { planta?: { nome?: string } } | undefined;
    expect(doComponente?.equipamento_pai?.unidade?.nome).toBe('Subestação Quíron');
    expect(doAntigo?.planta?.nome).toBe('Usina Zéfiro Teste');
  });

  // Mesmo nome (as cópias herdam o do template): sem desempate, por OFFSET o
  // Postgres não garante a ordem entre páginas, e planos se repetiam ou sumiam
  it('paginar pelo nome empatado não repete nem perde plano', async () => {
    const vistos: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const pagina = await planos.listar({ page, limit: 1, vinculados: true, search: 'zéfiro', sort_by: 'nome', sort_order: 'asc' }, admin);
      vistos.push(...pagina.data.map((p) => String(p.id).trim()));
    }
    expect(new Set(vistos).size).toBe(3);
  });

  // A busca alcança as relações, mas o escopo continua no AND
  it('quem não tem a planta não acha nada pelo nome dela', async () => {
    const semPlanta = { id: ID('semplanta'), role: 'operador' };
    expect((await planos.listar({ page: 1, limit: 20, vinculados: true, search: 'zéfiro' }, semPlanta)).data).toEqual([]);
    expect((await anomalias.findAll({ page: 1, limit: 20, search: 'zéfiro' }, semPlanta)).data).toEqual([]);
    expect((await solicitacoes.findAll({ page: 1, limit: 20, search: 'zéfiro' }, semPlanta)).data).toEqual([]);
  });

  it('anomalia: pela planta e pela instalação do UC pai', async () => {
    for (const termo of ['zéfiro', 'quíron']) expect(await anomaliasAchadas(termo)).toEqual([`${PREFIXO} ruído`]);
  });

  it('solicitação: pelo solicitante, pela planta e pela instalação; a linha traz as duas', async () => {
    for (const termo of ['hipólita', 'zéfiro', 'quíron']) expect(await solicitacoesAchadas(termo)).toEqual([`${PREFIXO}-1`]);
    // Hidratadas numa consulta por tabela (eram duas por linha)
    const [linha] = (await solicitacoes.findAll({ page: 1, limit: 20, search: 'hipólita' }, admin)).data;
    expect([linha.planta?.nome, linha.unidade?.nome]).toEqual(['Usina Zéfiro Teste', 'Subestação Quíron']);
  });
});

import { PrismaClient } from '@prisma/client';
import { planoAHerdar, aplicarDatasHerdadas } from './heranca-de-plano';

/**
 * A heranca de plano quando o equipamento de uma posicao e trocado.
 *
 * O plano e do EQUIPAMENTO, entao o novo nasce sem nenhum. Mas a posicao nao
 * mudou de funcao: o que se fazia ali continua tendo de ser feito. A heranca
 * existe para isso — e precisa ser explicita, porque as datas quase nunca
 * passam iguais. Uma preventiva semestral feita ha 3 meses no equipamento antigo
 * pode ter sido feita ha 5 no novo.
 */
describe('heranca de plano (banco real)', () => {
  const prisma = new PrismaClient();

  const ID_PROP = 'TESTEHERPROPRIETARIO00001';
  const ID_PLANTA = 'TESTEHERPLANTA0000000001';
  const ID_UNIDADE = 'TESTEHERUNIDADE000000001';
  const ID_CATEGORIA = 'TESTEHERCATEGORIA0000001';
  const ID_TIPO = 'TESTEHERTIPO000000000001';

  let posicaoId: string;
  let antigo: string;
  let novo: string;

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: ID_PROP }, update: {},
      create: { id: ID_PROP, nome: 'Prop heranca', email: 'heranca.teste@exemplo.local' },
    });
    await prisma.plantas.upsert({
      where: { id: ID_PLANTA }, update: {},
      create: {
        id: ID_PLANTA, nome: 'Planta heranca', proprietario_id: ID_PROP,
        cnpj: '00000000000434', localizacao: 'T', horario_funcionamento: '8-18',
        logradouro: 'R 1', cidade: 'Goiania', uf: 'GO', cep: '74000000',
      },
    });
    await prisma.unidades.upsert({
      where: { id: ID_UNIDADE }, update: {},
      create: {
        id: ID_UNIDADE, planta_id: ID_PLANTA, nome: 'Unidade heranca', tipo: 'Carga',
        estado: 'GO', cidade: 'Goiania', latitude: 0, longitude: 0, potencia: 0,
      },
    });
    await prisma.categorias_equipamentos.upsert({
      where: { id: ID_CATEGORIA }, update: {},
      create: { id: ID_CATEGORIA, nome: 'Categoria heranca' },
    });
    await prisma.tipos_equipamentos.upsert({
      where: { id: ID_TIPO }, update: {},
      create: {
        id: ID_TIPO, codigo: 'TESTE_HER_TIPO', nome: 'Tipo heranca',
        categoria_id: ID_CATEGORIA, fabricante: 'Teste',
      },
    });
  });

  beforeEach(async () => {
    await prisma.tarefas.deleteMany({ where: { planta_id: ID_PLANTA } });
    await prisma.planos_manutencao.deleteMany({ where: { categoria_id: ID_CATEGORIA } });
    await prisma.ativos_funcionais_equipamentos.deleteMany({});
    await prisma.equipamentos.updateMany({ data: { ativo_funcional_id: null, ativo_na_posicao: false } });
    await prisma.equipamentos.deleteMany({ where: { unidade_id: ID_UNIDADE } });
    await prisma.ativos_funcionais.deleteMany({ where: { unidade_id: ID_UNIDADE } });

    const posicao = await prisma.ativos_funcionais.create({
      data: { nome: 'Posicao heranca', categoria_id: ID_CATEGORIA, unidade_id: ID_UNIDADE },
    });
    posicaoId = posicao.id.trim();

    const criarEq = async (nome: string) => (await prisma.equipamentos.create({
      data: {
        nome, classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE, tipo_equipamento_id: ID_TIPO,
      },
    })).id;

    antigo = await criarEq('Equipamento antigo');
    novo = await criarEq('Equipamento novo');
  });

  afterAll(async () => { await prisma.$disconnect(); });

  /** Instala o antigo com plano e tarefa, remove, e instala o novo sem plano. */
  const montarTroca = async () => {
    await prisma.ativos_funcionais_equipamentos.create({
      data: { ativo_funcional_id: posicaoId, equipamento_id: antigo },
    });
    await prisma.equipamentos.update({
      where: { id: antigo }, data: { ativo_funcional_id: posicaoId, ativo_na_posicao: true },
    });

    const template = await prisma.planos_manutencao.create({
      data: { nome: 'Preventiva semestral', categoria_id: ID_CATEGORIA },
    });
    const copia = await prisma.planos_manutencao.create({
      data: { nome: 'Preventiva semestral', equipamento_id: antigo, plano_origem_id: template.id },
    });
    await prisma.tarefas.create({
      data: {
        plano_manutencao_id: copia.id, equipamento_id: antigo, planta_id: ID_PLANTA,
        tag: 'TRF-HER-001', nome: 'Troca de oleo', criticidade: 3, ordem: 1,
        data_ultima_execucao: new Date('2026-06-02T00:00:00Z'),
        data_ancora: new Date('2026-01-02T00:00:00Z'),
      },
    });

    // troca
    await prisma.ativos_funcionais_equipamentos.updateMany({
      where: { ativo_funcional_id: posicaoId, removido_em: null },
      data: { removido_em: new Date(), motivo_remocao: 'Queimou' },
    });
    await prisma.equipamentos.update({ where: { id: antigo }, data: { ativo_na_posicao: false } });
    await prisma.ativos_funcionais_equipamentos.create({
      data: { ativo_funcional_id: posicaoId, equipamento_id: novo },
    });
    await prisma.equipamentos.update({
      where: { id: novo }, data: { ativo_funcional_id: posicaoId, ativo_na_posicao: true },
    });

    return { template: template.id, copia: copia.id };
  };

  describe('planoAHerdar', () => {
    it('devolve o TEMPLATE do plano do ocupante anterior, nao a copia dele', async () => {
      const { template } = await montarTroca();

      const heranca = await planoAHerdar(prisma as any, posicaoId);

      // Herdar a copia amarraria o equipamento novo ao plano do antigo. O que se
      // repete e o template da categoria.
      expect(heranca?.template_id?.trim()).toBe(template.trim());
      expect(heranca?.nome).toBe('Preventiva semestral');
    });

    it('traz as datas de cada tarefa, que sao o que precisa ser ajustado', async () => {
      await montarTroca();

      const heranca = await planoAHerdar(prisma as any, posicaoId);

      expect(heranca?.tarefas).toHaveLength(1);
      expect(heranca?.tarefas[0].nome).toBe('Troca de oleo');
      expect(heranca?.tarefas[0].data_ultima_execucao?.toISOString().slice(0, 10)).toBe('2026-06-02');
    });

    it('devolve nulo quando o ocupante anterior nao tinha plano', async () => {
      await prisma.ativos_funcionais_equipamentos.create({
        data: {
          ativo_funcional_id: posicaoId, equipamento_id: antigo,
          removido_em: new Date(), motivo_remocao: 'Queimou',
        },
      });

      expect(await planoAHerdar(prisma as any, posicaoId)).toBeNull();
    });

    it('devolve nulo quando nunca houve ocupante anterior', async () => {
      expect(await planoAHerdar(prisma as any, posicaoId)).toBeNull();
    });
  });

  describe('aplicarDatasHerdadas', () => {
    it('ajusta a data de ultima execucao das tarefas do equipamento novo', async () => {
      await montarTroca();

      // O novo ja recebeu a copia do template (o que `vincularPlano` faz).
      const copiaNova = await prisma.planos_manutencao.create({
        data: { nome: 'Preventiva semestral', equipamento_id: novo },
      });
      const tarefaNova = await prisma.tarefas.create({
        data: {
          plano_manutencao_id: copiaNova.id, equipamento_id: novo, planta_id: ID_PLANTA,
          tag: 'TRF-HER-002', nome: 'Troca de oleo', criticidade: 3, ordem: 1,
        },
      });

      await aplicarDatasHerdadas(prisma as any, novo, [
        { tarefa_id: tarefaNova.id, data_ultima_execucao: new Date('2026-04-02T00:00:00Z') },
      ]);

      const depois = await prisma.tarefas.findUnique({ where: { id: tarefaNova.id } });
      expect(depois?.data_ultima_execucao?.toISOString().slice(0, 10)).toBe('2026-04-02');
      // A ancora acompanha: e dela que sai o proximo vencimento.
      expect(depois?.data_ancora?.toISOString().slice(0, 10)).toBe('2026-04-02');
    });

    it('ignora tarefa que nao pertence ao equipamento informado', async () => {
      const { copia } = await montarTroca();
      const doAntigo = await prisma.tarefas.findFirst({ where: { plano_manutencao_id: copia } });

      // Ajustar tarefa de outro equipamento reescreveria historico alheio.
      await aplicarDatasHerdadas(prisma as any, novo, [
        { tarefa_id: doAntigo!.id, data_ultima_execucao: new Date('2020-01-01T00:00:00Z') },
      ]);

      const intacta = await prisma.tarefas.findUnique({ where: { id: doAntigo!.id } });
      expect(intacta?.data_ultima_execucao?.toISOString().slice(0, 10)).toBe('2026-06-02');
    });
  });
});

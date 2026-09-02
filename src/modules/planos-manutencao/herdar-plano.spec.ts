import { PrismaClient } from '@prisma/client';
import { PlanosManutencaoService } from './planos-manutencao.service';
import { planoAHerdar } from './heranca-de-plano';

/**
 * A heranca inteira, pelo mesmo caminho que o controller usa.
 *
 * As pecas (planoAHerdar, mapearAjustesParaCopia, aplicarDatasHerdadas) tem
 * teste proprio. O que se prova aqui e a composicao: copiar o template para o
 * equipamento novo e, no mesmo passo, traduzir as datas que a tela editou nas
 * tarefas do equipamento ANTIGO. E a traducao que so existe aqui — as tarefas
 * novas nao tinham id quando a tela montou o formulario.
 */
describe('herdarPlano (banco real)', () => {
  const prisma = new PrismaClient();
  const service = new PlanosManutencaoService(
    prisma as any,
    { assertEntityInScope: async () => undefined } as any,
    { propagarParaCopias: async () => undefined } as any,
  );

  const ID_PROP = 'TESTEHDRPROPRIETARIO00001';
  const ID_PLANTA = 'TESTEHDRPLANTA0000000001';
  const ID_UNIDADE = 'TESTEHDRUNIDADE000000001';
  const ID_CATEGORIA = 'TESTEHDRCATEGORIA0000001';
  const ID_TIPO = 'TESTEHDRTIPO000000000001';

  let posicaoId: string;
  let antigo: string;
  let novo: string;
  let templateId: string;

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: ID_PROP }, update: {},
      create: { id: ID_PROP, nome: 'Prop herdar', email: 'herdar.teste@exemplo.local' },
    });
    await prisma.plantas.upsert({
      where: { id: ID_PLANTA }, update: {},
      create: {
        id: ID_PLANTA, nome: 'Planta herdar', proprietario_id: ID_PROP,
        cnpj: '00000000000435', localizacao: 'T', horario_funcionamento: '8-18',
        logradouro: 'R 1', cidade: 'Goiania', uf: 'GO', cep: '74000000',
      },
    });
    await prisma.unidades.upsert({
      where: { id: ID_UNIDADE }, update: {},
      create: {
        id: ID_UNIDADE, planta_id: ID_PLANTA, nome: 'Unidade herdar', tipo: 'Carga',
        estado: 'GO', cidade: 'Goiania', latitude: 0, longitude: 0, potencia: 0,
      },
    });
    await prisma.categorias_equipamentos.upsert({
      where: { id: ID_CATEGORIA }, update: {},
      create: { id: ID_CATEGORIA, nome: 'Categoria herdar' },
    });
    await prisma.tipos_equipamentos.upsert({
      where: { id: ID_TIPO }, update: {},
      create: {
        id: ID_TIPO, codigo: 'TESTE_HDR_TIPO', nome: 'Tipo herdar',
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

    posicaoId = (await prisma.ativos_funcionais.create({
      data: { nome: 'Posicao herdar', categoria_id: ID_CATEGORIA, unidade_id: ID_UNIDADE },
    })).id.trim();

    const criarEq = async (nome: string) => (await prisma.equipamentos.create({
      data: {
        nome, classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE, tipo_equipamento_id: ID_TIPO,
      },
    })).id;
    antigo = await criarEq('Equipamento antigo');
    novo = await criarEq('Equipamento novo');

    // Template da categoria, com duas tarefas.
    const template = await prisma.planos_manutencao.create({
      data: { nome: 'Preventiva semestral', categoria_id: ID_CATEGORIA },
    });
    templateId = template.id;
    for (const [i, nome] of [['1', 'Troca de oleo'], ['2', 'Inspecao visual']]) {
      await prisma.tarefas.create({
        data: {
          plano_manutencao_id: templateId, planta_id: ID_PLANTA,
          tag: `TRF-HDR-TPL-${i}`, nome, criticidade: 3, ordem: Number(i),
          frequencia: 'SEMESTRAL',
        },
      });
    }

    // O antigo ocupou a posicao com uma copia do template, e saiu.
    await service.vincularEquipamento({ equipamento_id: antigo, plano_id: templateId });
    await prisma.ativos_funcionais_equipamentos.create({
      data: {
        ativo_funcional_id: posicaoId, equipamento_id: antigo,
        removido_em: new Date(), motivo_remocao: 'Queimou',
      },
    });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('copia o template para o equipamento novo e aplica as datas revisadas', async () => {
    const heranca = await planoAHerdar(prisma as any, posicaoId);
    const trocaDeOleo = heranca!.tarefas.find(t => t.nome === 'Troca de oleo')!;

    const r = await service.herdarPlano({
      ativo_funcional_id: posicaoId,
      equipamento_id: novo,
      // A tela manda o id da tarefa do ANTIGO — e o que ela tinha para mostrar.
      ajustes: [{ tarefa_id: trocaDeOleo.id, data_ultima_execucao: '2026-04-02T00:00:00.000Z' }],
    });

    expect(r.tarefas_copiadas).toBe(2);
    expect(r.datas_aplicadas).toBe(1);

    const tarefas = await prisma.tarefas.findMany({
      where: { equipamento_id: novo, deleted_at: null },
      select: { nome: true, data_ultima_execucao: true, data_ancora: true },
    });
    const oleo = tarefas.find(t => t.nome === 'Troca de oleo')!;
    expect(oleo.data_ultima_execucao?.toISOString().slice(0, 10)).toBe('2026-04-02');
    expect(oleo.data_ancora?.toISOString().slice(0, 10)).toBe('2026-04-02');

    // Tarefa sem ajuste entra zerada de proposito: data herdada errada gera
    // vencimento errado calado, enquanto sem data ela aparece como pendente.
    expect(tarefas.find(t => t.nome === 'Inspecao visual')!.data_ultima_execucao).toBeNull();
  });

  it('a copia nova sai do template, nao do plano do equipamento antigo', async () => {
    await service.herdarPlano({ ativo_funcional_id: posicaoId, equipamento_id: novo });

    // `novo` vem de um `create` e carrega o padding do char(26); a coluna
    // `planos_manutencao.equipamento_id` e varchar e guarda o que o
    // `vincularEquipamento` gravou, que e trimado. Buscar com o id padded aqui
    // acharia nada — o mesmo descasamento que o `planoAHerdar` trata.
    const copia = await prisma.planos_manutencao.findFirst({
      where: { equipamento_id: novo.trim(), deleted_at: null },
      select: { plano_origem_id: true },
    });
    expect(copia?.plano_origem_id?.trim()).toBe(templateId.trim());
  });

  it('recusa quando a posicao nao teve ocupante anterior com plano', async () => {
    await prisma.ativos_funcionais_equipamentos.deleteMany({ where: { ativo_funcional_id: posicaoId } });

    await expect(
      service.herdarPlano({ ativo_funcional_id: posicaoId, equipamento_id: novo }),
    ).rejects.toThrow(/nao tem ocupante anterior/i);
  });
});

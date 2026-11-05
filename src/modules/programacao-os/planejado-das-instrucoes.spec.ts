import { PermissionScopeService, PrismaService } from '@/core';
import { ProgramacaoOSService } from './programacao-os.service';
import { apagarSolicitacoesDeTeste, criarPlantaDeTeste, solicitacaoDeTeste } from '../../../test/planta-de-teste';
import { contribuicaoDaInstrucao, pedidoTrazPlanejado, SEM_PRECO } from './planejado-das-instrucoes';
import type { LinhaDeCusto } from '../instrucoes/custo-da-instrucao';

/**
 * O planejado das instruções no servidor (05/nov/2026). Só a tela somava os
 * recursos das instruções da origem: a programação do cron, das rotas `from-*`
 * e de qualquer chamada sem as listas nascia sem materiais, equipe, ferramentas
 * e outros custos — a solicitação com quatro instruções chegava vazia à OS.
 *
 * Roda com `pnpm jest --runInBand src/modules/programacao-os/planejado-das-instrucoes`.
 */
const linha = (dados: Partial<LinhaDeCusto> & { unidade?: string | null }): LinhaDeCusto & { unidade?: string | null } =>
  ({
    origem: 'recurso',
    grupo: 'recursos',
    recurso_id: 'r1',
    maquinario_id: null,
    nome: 'Item',
    categoria: 'MATERIAL',
    rubrica: 'materiais',
    base_calculo: 'unidade',
    quantidade: 1,
    duracao_horas: 0,
    fator_perda: 0,
    fornecido_pelo_cliente: false,
    distancia_km: null,
    horas_por_diaria: 8,
    unidades: 1,
    preco_base: null,
    preco_cadastro: null,
    preco_proprio: null,
    subtotal: null,
    ...dados,
  }) as LinhaDeCusto;

describe('o planejado de uma instrução (a regra da tela)', () => {
  it('material com a perda, para cima, e o custo da unidade', () => {
    const p = contribuicaoDaInstrucao([linha({ nome: 'Cabo 6 mm', quantidade: 40, fator_perda: 0.1, subtotal: 220, unidade: 'm' })], []);
    expect(p.materiais).toEqual([{ descricao: 'Cabo 6 mm', quantidade_planejada: 44, unidade: 'm', custo_unitario: 5 }]);
  });

  it('material sem unidade no cadastro entra como "un" (a linha recusa vazia)', () => {
    expect(contribuicaoDaInstrucao([linha({ nome: 'Fusível', unidade: null })], []).materiais[0].unidade).toBe('un');
  });

  it('mão de obra: uma vaga por pessoa, com o custo da hora; mais de 24 h vira outra vaga', () => {
    const p = contribuicaoDaInstrucao(
      [
        linha({ nome: 'Eletricista', categoria: 'MAO_DE_OBRA', base_calculo: 'hora', quantidade: 2, duracao_horas: 3, subtotal: 600 }),
        linha({ nome: 'Engenheiro', categoria: 'MAO_DE_OBRA', base_calculo: 'hora', quantidade: 1, duracao_horas: 30, subtotal: null, preco_base: 150 }),
      ],
      [],
    );
    expect(p.tecnicos).toEqual([
      { especialidade: 'Eletricista', horas_estimadas: 3, custo_hora: 100 },
      { especialidade: 'Eletricista', horas_estimadas: 3, custo_hora: 100 },
      { especialidade: 'Engenheiro', horas_estimadas: 24, custo_hora: 150 },
      { especialidade: 'Engenheiro', horas_estimadas: 6, custo_hora: 150 },
    ]);
  });

  it('instrumento vira ferramenta e custo; terceiro sem preço vai marcado; o fornecido pelo cliente não entra', () => {
    const p = contribuicaoDaInstrucao(
      [
        linha({ nome: 'Megômetro', categoria: 'INSTRUMENTO', base_calculo: 'fechado', subtotal: 200 }),
        linha({ nome: 'ART', categoria: 'TERCEIRO', base_calculo: 'fechado', subtotal: null }),
        linha({ nome: 'Diária', categoria: 'DESPESA_CAMPO', base_calculo: 'fechado', subtotal: 0 }),
      ],
      [linha({ origem: 'maquinario', nome: 'Munck', categoria: 'maquinario', quantidade: 1, subtotal: 900 })],
    );
    expect(p.ferramentas).toEqual([{ descricao: 'Megômetro', quantidade: 1 }, { descricao: 'Munck', quantidade: 1 }]);
    expect(p.itens_orcamento).toEqual([
      { descricao: 'Instrumento: Megômetro', valor: 200, natureza: 'INSTRUMENTO' },
      { descricao: `Terceiro: ART ${SEM_PRECO}`, valor: 0, natureza: 'TERCEIRO' },
      { descricao: 'Maquinário: Munck', valor: 900, natureza: 'MAQUINARIO' },
    ]);
  });

  it('mão de obra de valor fechado (sem horas): a vaga pede as horas e o custo vai ao orçamento', () => {
    const p = contribuicaoDaInstrucao([linha({ nome: 'Eletricista', categoria: 'MAO_DE_OBRA', base_calculo: 'fechado', subtotal: 500 })], []);
    expect(p.tecnicos).toEqual([{ especialidade: 'Eletricista', horas_estimadas: 0 }]);
    expect(p.itens_orcamento).toEqual([{ descricao: 'Mão de obra: Eletricista', valor: 500, natureza: 'OUTRO' }]);
  });

  it('o pedido com qualquer lista planejou (a tela manda as quatro, mesmo vazias)', () => {
    expect(pedidoTrazPlanejado({})).toBe(false);
    expect(pedidoTrazPlanejado({ materiais: [] })).toBe(true);
  });
});

describe('a programação nasce com o planejado das instruções (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);

  const PREFIXO = 'TESTE-PLANEJADO-INSTRUCOES';
  const CODIGO = 'TESTE-PLIN-';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  const ids = { A: '', B: '' };
  let tarefaId = '';
  let outraTarefaId = '';

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: progs.map((i) => i.trim()) } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.materiais_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.ferramentas_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.tecnicos_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.itens_orcamento_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
    await prisma.historico_anomalias.deleteMany({ where: { anomalia: { descricao: { startsWith: PREFIXO } } } });
    await prisma.anomalias_instrucoes.deleteMany({ where: { anomalia: { descricao: { startsWith: PREFIXO } } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
  };

  const apagarCatalogo = async () => {
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: CODIGO } } });
    await prisma.instrucao_recursos.deleteMany({ where: { recurso: { nome: { startsWith: CODIGO } } } });
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: CODIGO } } });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: CODIGO } } });
  };

  const recurso = (nome: string, categoria: string, base_calculo: string, preco: number | null, unidade: string | null = null) =>
    prisma.recursos.create({
      data: { nome: `${CODIGO}${nome}`, categoria: categoria as never, base_calculo, rubrica: 'instrucoes', preco_unitario: preco, unidade },
    });

  beforeAll(async () => {
    await limpar();
    await apagarCatalogo();
    planta = await criarPlantaDeTeste(prisma, 'planejadoinstrucoes', '95.000.000/0001-05');
    const cabo = await recurso('Cabo', 'MATERIAL', 'unidade', 5, 'm');
    const eletricista = await recurso('Eletricista', 'MAO_DE_OBRA', 'hora', 100);
    const megometro = await recurso('Megometro', 'INSTRUMENTO', 'fechado', 200);
    const art = await recurso('ART', 'TERCEIRO', 'fechado', null);

    const a = await prisma.instrucoes.create({ data: { codigo: `${CODIGO}A`, nome: 'Trocar o cabo', ativo: true } });
    const b = await prisma.instrucoes.create({ data: { codigo: `${CODIGO}B`, nome: 'Emitir a ART', ativo: true } });
    ids.A = a.id.trim();
    ids.B = b.id.trim();
    await prisma.instrucao_recursos.createMany({
      data: [
        { instrucao_id: a.id, recurso_id: cabo.id, quantidade: 10, fator_perda: 0.1 },
        { instrucao_id: a.id, recurso_id: eletricista.id, quantidade: 2, duracao_horas: 3 },
        { instrucao_id: a.id, recurso_id: megometro.id, quantidade: 1 },
        { instrucao_id: b.id, recurso_id: cabo.id, quantidade: 4 },
        { instrucao_id: b.id, recurso_id: art.id, quantidade: 1 },
      ],
    });
    tarefaId = (await prisma.tarefas.create({ data: { tag: `${CODIGO}T1`, nome: 'Troca do cabo', criticidade: 3, ordem: 1, instrucao_id: a.id } })).id.trim();
    outraTarefaId = (await prisma.tarefas.create({ data: { tag: `${CODIGO}T2`, nome: 'Troca do cabo 2', criticidade: 3, ordem: 1, instrucao_id: a.id } })).id.trim();
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await apagarSolicitacoesDeTeste(prisma, [planta.id]);
    await apagarCatalogo();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const pedido = (extra: Record<string, unknown>) =>
    ({ descricao: `${PREFIXO} programação`, condicoes: 'FUNCIONANDO', tipo: 'CORRETIVA', prioridade: 'MEDIA', planta_id: planta.id, ...extra }) as never;

  const anomaliaCom = async (instrucoes: string[]) => {
    const anomalia = await prisma.anomalias.create({
      data: { descricao: `${PREFIXO} anomalia`, local: 'Painel', ativo: 'Painel 1', origem: 'OPERADOR', planta_id: planta.id },
    });
    for (const instrucao_id of instrucoes) await prisma.anomalias_instrucoes.create({ data: { anomalia_id: anomalia.id, instrucao_id } });
    return anomalia.id;
  };

  const planejado = async (programacaoId: string) => {
    const [materiais, tecnicos, ferramentas, itens, prog] = await Promise.all([
      prisma.materiais_programacao_os.findMany({ where: { programacao_id: programacaoId }, orderBy: { descricao: 'asc' } }),
      prisma.tecnicos_programacao_os.findMany({ where: { programacao_id: programacaoId } }),
      prisma.ferramentas_programacao_os.findMany({ where: { programacao_id: programacaoId } }),
      prisma.itens_orcamento_programacao_os.findMany({ where: { programacao_id: programacaoId }, orderBy: { descricao: 'asc' } }),
      prisma.programacoes_os.findUniqueOrThrow({ where: { id: programacaoId }, select: { orcamento_previsto: true } }),
    ]);
    return {
      materiais: materiais.map((m) => [m.descricao, Number(m.quantidade_planejada), m.unidade, Number(m.custo_unitario)]),
      tecnicos: tecnicos.map((t) => [t.especialidade, Number(t.horas_estimadas), Number(t.custo_hora)]),
      ferramentas: ferramentas.map((f) => [f.descricao, Number(f.quantidade)]),
      itens: itens.map((i) => [i.descricao, Number(i.valor), i.natureza]),
      orcamento: Number(prog.orcamento_previsto),
    };
  };

  it('a da anomalia, sem as listas no pedido, nasce com o planejado das instruções dela', async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([ids.A, ids.B]) }));

    expect(await planejado(prog.id)).toEqual({
      // 11 m da A (10 com 10% de perda) + 4 m da B, a R$ 5
      materiais: [[`${CODIGO}Cabo`, 15, 'm', 5]],
      tecnicos: [
        [`${CODIGO}Eletricista`, 3, 100],
        [`${CODIGO}Eletricista`, 3, 100],
      ],
      ferramentas: [[`${CODIGO}Megometro`, 1]],
      itens: [
        [`Instrumento: ${CODIGO}Megometro`, 200, 'INSTRUMENTO'],
        [`Terceiro: ${CODIGO}ART ${SEM_PRECO}`, 0, 'TERCEIRO'],
      ],
      orcamento: 75 + 600 + 200,
    });
  });

  it('a da solicitação (a rota from-solicitacao) também', async () => {
    const origem = await solicitacaoDeTeste(prisma, planta.id);
    await prisma.solicitacoes_instrucoes.create({ data: { solicitacao_id: origem.solicitacao_servico_id, instrucao_id: ids.B, ordem: 1 } });

    const prog = await programacoes.criarDeSolicitacao(origem.solicitacao_servico_id);

    const { materiais, itens } = await planejado(prog.id);
    expect(materiais).toEqual([[`${CODIGO}Cabo`, 4, 'm', 5]]);
    expect(itens).toEqual([[`Terceiro: ${CODIGO}ART ${SEM_PRECO}`, 0, 'TERCEIRO']]);
  });

  it('a das tarefas (o cron) leva o planejado da instrução de cada tarefa', async () => {
    const prog = await programacoes.criar(pedido({ tipo: 'PREVENTIVA', origem: 'TAREFA', tarefas_ids: [tarefaId] }));

    const { materiais, tecnicos, ferramentas } = await planejado(prog.id);
    expect(materiais).toEqual([[`${CODIGO}Cabo`, 11, 'm', 5]]);
    expect(tecnicos).toHaveLength(2);
    expect(ferramentas).toEqual([[`${CODIGO}Megometro`, 1]]);
  });

  it('duas tarefas com a mesma instrução (o cron junta assim) são duas vezes o planejado; a avulsa igual não soma de novo', async () => {
    const prog = await programacoes.criar(
      pedido({ tipo: 'PREVENTIVA', origem: 'TAREFA', tarefas_ids: [tarefaId, outraTarefaId], instrucoes_ids: [ids.A] }),
    );

    const { materiais, tecnicos } = await planejado(prog.id);
    expect(materiais).toEqual([[`${CODIGO}Cabo`, 22, 'm', 5]]);
    // Cada eletricista faz as duas trocas: as vagas somam as horas
    expect(tecnicos).toEqual([
      [`${CODIGO}Eletricista`, 6, 100],
      [`${CODIGO}Eletricista`, 6, 100],
    ]);
  });

  it('o pedido que traz as listas (a tela) vale como veio, mesmo vazio', async () => {
    const prog = await programacoes.criar(
      pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([ids.A]), materiais: [], tecnicos: [], ferramentas: [], itens_orcamento: [] }),
    );

    expect(await planejado(prog.id)).toEqual({ materiais: [], tecnicos: [], ferramentas: [], itens: [], orcamento: expect.any(Number) });
  });
});

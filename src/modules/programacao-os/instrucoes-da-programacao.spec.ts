import { BadRequestException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { ProgramacaoOSService } from './programacao-os.service';
import { ExecucaoOSService } from '../execucao-os/execucao-os.service';
import { HistoricoEquipamentoService } from '../tarefas/historico-equipamento.service';
import { criarPlantaDeTeste, solicitacaoDeTeste } from '../../../test/planta-de-teste';
import { MAXIMO_DE_INSTRUCOES, equipamentoDasAvulsas } from './instrucoes-da-programacao';

/**
 * Instruções na OS de qualquer origem (SN-86), contra Postgres de verdade.
 *
 * A programação nasce com as instruções da origem (as da anomalia ou da
 * solicitação) e o planejador acrescenta ou tira. A instrução que não vem por
 * tarefa é uma linha de `tarefas_programacao_os` / `tarefas_os` sem tarefa
 * (`origem_item = 'INSTRUCAO'`), e a execução a trata como a da tarefa: o
 * checklist sai dos passos dela, ela se marca feita ou não feita.
 *
 * Antes, a corretiva de uma anomalia com instruções nascia sem checklist: só
 * as instruções das tarefas chegavam à OS.
 *
 * Roda com `npx jest --runInBand src/modules/programacao-os/instrucoes-da-programacao`.
 */
describe('o equipamento da instrução avulsa', () => {
  // A programação de anomalia criada pela tela não tem equipamento: com a avulsa
  // sem ele, a corretiva sumia do histórico do equipamento
  const cliente = (anomalia: string | null, solicitacao: string | null) =>
    ({
      anomalias: { findFirst: jest.fn().mockResolvedValue(anomalia === null ? null : { equipamento_id: anomalia }) },
      solicitacoes_servico: { findFirst: jest.fn().mockResolvedValue(solicitacao === null ? null : { equipamento_id: solicitacao }) },
    }) as never;

  it('o da programação; sem ele, o da anomalia ou o da solicitação', async () => {
    expect(await equipamentoDasAvulsas(cliente('eqA', null), { equipamento_id: ' eqP ', anomalia_id: 'an1' })).toBe('eqP');
    expect(await equipamentoDasAvulsas(cliente('eqA ', null), { equipamento_id: null, anomalia_id: 'an1' })).toBe('eqA');
    expect(await equipamentoDasAvulsas(cliente(null, 'eqS'), { dados_origem: { solicitacaoServicoId: 'ss1' } })).toBe('eqS');
    expect(await equipamentoDasAvulsas(cliente(null, null), { equipamento_id: '' })).toBeNull();
  });
});

describe('instruções na OS de qualquer origem (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);
  const historico = new HistoricoEquipamentoService(prisma);

  const PREFIXO = 'TESTE-INSTRUCOES-NA-OS';
  const CODIGO = 'TESTE-INOS-';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  /** Três instruções com passos (A, B, C), uma inativa (D), uma que os casos excluem (E) e a da tarefa (T) */
  const ids: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'T', string> = { A: '', B: '', C: '', D: '', E: '', T: '' };
  let tarefaId: string;

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    const oss = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs } }, select: { id: true } })).map((o) => o.id);
    await prisma.checklist_atividades_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...progs, ...oss].map((i) => i.trim()) } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
    await prisma.historico_anomalias.deleteMany({ where: { anomalia: { descricao: { startsWith: PREFIXO } } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
  };

  const apagarCatalogo = async () => {
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: CODIGO } } });
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao: { codigo: { startsWith: CODIGO } } } });
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: CODIGO } } });
  };

  const instrucao = async (letra: keyof typeof ids, nome: string, passos: string[], ativo = true) => {
    const criada = await prisma.instrucoes.create({ data: { codigo: `${CODIGO}${letra}`, nome, descricao: `Instrução ${letra}`, ativo } });
    if (passos.length) {
      await prisma.sub_instrucoes.createMany({
        data: passos.map((descricao, i) => ({ instrucao_id: criada.id, descricao, ordem: i + 1, obrigatoria: i === 0 })),
      });
    }
    ids[letra] = criada.id.trim();
  };

  beforeAll(async () => {
    await limpar();
    await apagarCatalogo();
    planta = await criarPlantaDeTeste(prisma, 'instrucoesnaos', '95.000.000/0001-86');
    await instrucao('A', 'Trocar o fusível', ['Desenergizar', 'Trocar']);
    await instrucao('B', 'Medir o isolamento', ['Medir']);
    await instrucao('C', 'Reapertar os bornes', ['Reapertar']);
    await instrucao('D', 'Instrução retirada de uso', ['Nada'], false);
    await instrucao('E', 'Instrução que vai ser excluída', ['Passo E']);
    await instrucao('T', 'Limpar o painel', ['Limpar']);
    tarefaId = (await prisma.tarefas.create({
      data: { tag: `${CODIGO}T1`, nome: 'Limpeza do painel', criticidade: 3, ordem: 1, instrucao_id: ids.T },
    })).id.trim();
  });

  beforeEach(async () => {
    await limpar();
    await prisma.instrucoes.update({ where: { id: ids.E }, data: { deleted_at: null } });
  });

  afterAll(async () => {
    await limpar();
    await apagarCatalogo();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const pedido = (extra: Record<string, unknown>) =>
    ({
      descricao: `${PREFIXO} programação`,
      condicoes: 'FUNCIONANDO',
      tipo: 'CORRETIVA',
      prioridade: 'MEDIA',
      planta_id: planta.id,
      ...extra,
    }) as never;

  /** Uma anomalia com as instruções dadas, com o id de 25 caracteres do cuid() no Char(26) */
  const anomaliaCom = async (instrucoes: string[]) => {
    const anomalia = await prisma.anomalias.create({
      data: { descricao: `${PREFIXO} anomalia`, local: 'Painel', ativo: 'Painel 1', origem: 'OPERADOR', planta_id: planta.id },
    });
    for (const instrucao_id of instrucoes) {
      await prisma.anomalias_instrucoes.create({ data: { anomalia_id: anomalia.id, instrucao_id } });
    }
    return anomalia.id;
  };

  const linhasDaProgramacao = (programacaoId: string) =>
    prisma.tarefas_programacao_os.findMany({ where: { programacao_id: programacaoId }, orderBy: { ordem: 'asc' } });

  it('a corretiva da anomalia nasce com as instruções dela, na ordem do vínculo', async () => {
    const anomaliaId = await anomaliaCom([ids.B, ids.A]);
    expect(anomaliaId.trim()).toHaveLength(25);

    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: anomaliaId }));

    const linhas = await linhasDaProgramacao(prog.id);
    expect(linhas.map((l) => [l.origem_item, l.instrucao_id, l.tarefa_id, l.instrucao_tag])).toEqual([
      ['INSTRUCAO', ids.B, null, `${CODIGO}B`],
      ['INSTRUCAO', ids.A, null, `${CODIGO}A`],
    ]);
    // A resposta separa as avulsas das tarefas
    const detalhe = await programacoes.buscarPorId(prog.id);
    expect(detalhe.instrucoes.map((i) => i.nome)).toEqual(['Medir o isolamento', 'Trocar o fusível']);
    expect(detalhe.tarefas_programacao).toEqual([]);
  });

  it('a da solicitação também; e a lista enviada vale no lugar da da origem', async () => {
    const origem = await solicitacaoDeTeste(prisma, planta.id);
    await prisma.solicitacoes_instrucoes.create({ data: { solicitacao_id: origem.solicitacao_servico_id, instrucao_id: ids.C } });
    const daOrigem = await programacoes.criar(pedido(origem));
    expect((await linhasDaProgramacao(daOrigem.id)).map((l) => l.instrucao_id)).toEqual([ids.C]);

    const outra = await solicitacaoDeTeste(prisma, planta.id);
    await prisma.solicitacoes_instrucoes.create({ data: { solicitacao_id: outra.solicitacao_servico_id, instrucao_id: ids.C } });
    const escolhida = await programacoes.criar(pedido({ ...outra, instrucoes_ids: [ids.A] }));
    expect((await linhasDaProgramacao(escolhida.id)).map((l) => l.instrucao_id)).toEqual([ids.A]);

    const nenhuma = await solicitacaoDeTeste(prisma, planta.id);
    await prisma.solicitacoes_instrucoes.create({ data: { solicitacao_id: nenhuma.solicitacao_servico_id, instrucao_id: ids.C } });
    const vazia = await programacoes.criar(pedido({ ...nenhuma, instrucoes_ids: [] }));
    expect(await linhasDaProgramacao(vazia.id)).toEqual([]);
  });

  it('editar troca a lista: acrescenta, tira, e a repetida entra uma vez', async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([ids.A]) }));

    await programacoes.atualizar(prog.id, { instrucoes_ids: [ids.A, ids.B, ` ${ids.B} `] } as never);
    expect((await linhasDaProgramacao(prog.id)).map((l) => l.instrucao_id)).toEqual([ids.A, ids.B]);

    await programacoes.atualizar(prog.id, { instrucoes_ids: [ids.B] } as never);
    expect((await linhasDaProgramacao(prog.id)).map((l) => l.instrucao_id)).toEqual([ids.B]);

    // Sem a lista no corpo, a edição não mexe nas instruções
    await programacoes.atualizar(prog.id, { descricao: `${PREFIXO} editada` } as never);
    expect((await linhasDaProgramacao(prog.id)).map((l) => l.instrucao_id)).toEqual([ids.B]);
  });

  it('a instrução que já vem por uma tarefa não se repete (o checklist sairia duas vezes)', async () => {
    const prog = await programacoes.criar(pedido({ tipo: 'PREVENTIVA', origem: 'TAREFA', tarefas_ids: [tarefaId], instrucoes_ids: [ids.T, ids.A] }));

    const linhas = await linhasDaProgramacao(prog.id);
    expect(linhas.map((l) => [l.origem_item, l.instrucao_id])).toEqual([
      ['TAREFA', null],
      ['INSTRUCAO', ids.A],
    ]);
    // A avulsa vem depois das tarefas
    expect(linhas[1].ordem).toBeGreaterThan(linhas[0].ordem);
  });

  it('a instrução nova tem de estar ativa; a que a programação já tinha continua valendo', async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([]) }));
    await expect(programacoes.atualizar(prog.id, { instrucoes_ids: [ids.D] } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(programacoes.atualizar(prog.id, { instrucoes_ids: ['nao-existe'] } as never)).rejects.toThrow('não existe ou não está ativa');

    await programacoes.atualizar(prog.id, { instrucoes_ids: [ids.B] } as never);
    await prisma.instrucoes.update({ where: { id: ids.B }, data: { ativo: false } });
    try {
      await programacoes.atualizar(prog.id, { instrucoes_ids: [ids.B, ids.C] } as never);
      expect((await linhasDaProgramacao(prog.id)).map((l) => l.instrucao_id)).toEqual([ids.B, ids.C]);
    } finally {
      await prisma.instrucoes.update({ where: { id: ids.B }, data: { ativo: true } });
    }
  });

  it('a inativada depois do vínculo com a origem entra (pela origem e pela lista); a excluída da origem fica de fora', async () => {
    const anomaliaId = await anomaliaCom([ids.D, ids.E, ids.A]);
    await prisma.instrucoes.update({ where: { id: ids.E }, data: { deleted_at: new Date() } });

    // Antes, a inativa dava 400 e a anomalia não se programava mais
    const daOrigem = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: anomaliaId }));
    expect((await linhasDaProgramacao(daOrigem.id)).map((l) => l.instrucao_id)).toEqual([ids.D, ids.A]);
    // A resposta já traz as linhas gravadas (saía com as listas vazias)
    expect(daOrigem.instrucoes.map((i) => i.instrucao_id)).toEqual([ids.D, ids.A]);

    // A tela manda a lista semeada da origem: a inativa da origem também passa
    const outra = await anomaliaCom([ids.D]);
    const pelaTela = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: outra, instrucoes_ids: [ids.D] }));
    expect((await linhasDaProgramacao(pelaTela.id)).map((l) => l.instrucao_id)).toEqual([ids.D]);
  });

  it('editar grava só a diferença: a que fica mantém a linha e o congelamento, mesmo excluída depois', async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([ids.E, ids.A]) }));
    const [e] = await linhasDaProgramacao(prog.id);

    await prisma.instrucoes.update({ where: { id: ids.E }, data: { deleted_at: new Date(), nome: 'Nome novo de E' } });
    // A tela reenvia a lista a cada edição: a excluída que já estava não pode dar 400
    const resposta = await programacoes.atualizar(prog.id, { descricao: `${PREFIXO} editada`, instrucoes_ids: [ids.E, ids.A, ids.B] } as never);

    const linhas = await linhasDaProgramacao(prog.id);
    expect(linhas.map((l) => l.instrucao_id)).toEqual([ids.E, ids.A, ids.B]);
    expect(linhas[0]).toMatchObject({ id: e.id, nome_snapshot: 'Instrução que vai ser excluída' });
    expect(resposta.instrucoes.map((i) => i.instrucao_id)).toEqual([ids.E, ids.A, ids.B]);
    await prisma.instrucoes.update({ where: { id: ids.E }, data: { nome: 'Instrução que vai ser excluída' } });

    // A excluída não entra como nova
    const outra = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([]) }));
    await expect(programacoes.atualizar(outra.id, { instrucoes_ids: [ids.E] } as never)).rejects.toThrow('não existe ou não está ativa');
  });

  it('acrescentar depois a tarefa que traz uma avulsa tira a avulsa (o checklist a teria duas vezes)', async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([ids.T, ids.A]) }));
    await programacoes.adicionarTarefasProgramacao(prog.id, { tarefas_ids: [tarefaId] } as never);

    const linhas = await linhasDaProgramacao(prog.id);
    expect(linhas.map((l) => [l.origem_item, l.instrucao_id])).toEqual([
      ['TAREFA', null],
      ['INSTRUCAO', ids.A],
    ]);
  });

  it('o PATCH das tarefas não alcança as avulsas, nem com tarefa_id nulo', async () => {
    const prog = await programacoes.criar(pedido({ tipo: 'PREVENTIVA', origem: 'TAREFA', tarefas_ids: [tarefaId], instrucoes_ids: [ids.A] }));
    await programacoes.atualizarTarefasProgramacao(prog.id, { tarefas: [{ tarefa_id: null, ordem: 0, observacoes: 'invadiu' }] } as never);
    await programacoes.atualizarTarefasProgramacao(prog.id, { tarefas: [{ tarefa_id: tarefaId, ordem: 1, observacoes: 'da tarefa' }] } as never);

    const linhas = await linhasDaProgramacao(prog.id);
    expect(linhas.map((l) => [l.origem_item, l.observacoes])).toEqual([
      ['TAREFA', 'da tarefa'],
      ['INSTRUCAO', null],
    ]);
  });

  it(`no máximo ${MAXIMO_DE_INSTRUCOES} instruções avulsas`, async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([]) }));
    const demais = Array.from({ length: MAXIMO_DE_INSTRUCOES + 1 }, (_, i) => `id-${i}`);
    await expect(programacoes.atualizar(prog.id, { instrucoes_ids: demais } as never)).rejects.toThrow(`No máximo ${MAXIMO_DE_INSTRUCOES}`);
  });

  it('aprovar leva as avulsas à OS, e o checklist sai dos passos delas, agrupado por instrução', async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([ids.A, ids.B]) }));
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);

    const vinculos = await prisma.tarefas_os.findMany({ where: { os_id: os.id }, orderBy: { ordem: 'asc' } });
    expect(vinculos.map((v) => [v.origem_item, v.instrucao_id, v.tarefa_id, v.nome_snapshot])).toEqual([
      ['INSTRUCAO', ids.A, null, 'Trocar o fusível'],
      ['INSTRUCAO', ids.B, null, 'Medir o isolamento'],
    ]);
    const itens = await prisma.checklist_atividades_os.findMany({ where: { os_id: os.id }, orderBy: { ordem: 'asc' } });
    expect(itens.map((i) => [i.tarefa_os_id, i.atividade, i.obrigatoria])).toEqual([
      [vinculos[0].id, 'Trocar o fusível: Desenergizar', true],
      [vinculos[0].id, 'Trocar o fusível: Trocar', false],
      [vinculos[1].id, 'Medir o isolamento: Medir', true],
    ]);

    // A resposta da OS diz de onde veio o item e abre a instrução pelo id dela
    const detalhe = (await execucoes.buscarPorId(os.id)) as unknown as {
      tarefas_os: Array<{ origem_item: string; instrucao_id: string | null }>;
    };
    expect(detalhe.tarefas_os.map((t) => [t.origem_item, t.instrucao_id])).toEqual([
      ['INSTRUCAO', ids.A],
      ['INSTRUCAO', ids.B],
    ]);
  });

  it('a avulsa se marca feita e, pendente, pede o motivo ao executar', async () => {
    const prog = await programacoes.criar(pedido({ origem: 'ANOMALIA', anomalia_id: await anomaliaCom([ids.C, ids.B]) }));
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);
    const [reaperto, isolamento] = await prisma.tarefas_os.findMany({ where: { os_id: os.id }, orderBy: { ordem: 'asc' } });

    const itens = await prisma.checklist_atividades_os.findMany({ where: { os_id: os.id, tarefa_os_id: reaperto.id } });
    await execucoes.atualizarChecklist(os.id, { atividades: itens.map((i) => ({ id: i.id, concluida: true })) } as never);
    await execucoes.concluirTarefa(os.id, reaperto.id, {} as never);
    expect((await prisma.tarefas_os.findUniqueOrThrow({ where: { id: reaperto.id } })).status).toBe('CONCLUIDA');

    const corretiva = { resultado: 'Feito', equipamento_parou: false, falha_sintoma: 'x', falha_causa: 'y', falha_acao: 'z' };
    await expect(execucoes.executar(os.id, corretiva as never)).rejects.toThrow('Medir o isolamento');
    await execucoes.executar(os.id, { ...corretiva, tarefas_nao_feitas: [{ id: isolamento.id, motivo: 'Sem o megômetro' }] } as never);
    expect(await prisma.tarefas_os.findUniqueOrThrow({ where: { id: isolamento.id } })).toMatchObject({
      status: 'CANCELADA',
      observacoes: 'Sem o megômetro',
    });
  });

  it('a OS cujo vínculo não tem equipamento entra no histórico pelo equipamento da própria OS', async () => {
    const ordens = jest.spyOn(prisma.ordens_servico, 'findMany').mockResolvedValueOnce([]);
    try {
      await historico.listar('equipamento-qualquer');
      // Antes `none: {}`: a corretiva com avulsa sem equipamento não entrava por caminho nenhum
      expect(ordens.mock.calls[0][0]).toMatchObject({ where: { tarefas_os: { none: { equipamento_id: { not: null } } } } });
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('a avulsa concluída não conta como execução da tarefa de mesmo nome no histórico do equipamento', async () => {
    // A atribuição é por id e, no vínculo órfão, pelo nome congelado: sem o filtro,
    // a avulsa "Limpeza do painel" adiaria o próximo ciclo da tarefa de mesmo nome
    jest.spyOn(prisma.tarefas, 'findMany').mockResolvedValueOnce([{ id: tarefaId, nome: 'Limpeza do painel' }] as never);
    const execucoesDoEquipamento = jest.spyOn(prisma.tarefas_os, 'findMany').mockResolvedValueOnce([]);
    try {
      await historico.situacaoDasTarefas('equipamento-qualquer');
      expect(execucoesDoEquipamento.mock.calls[0][0]).toMatchObject({ where: { origem_item: 'TAREFA', status: 'CONCLUIDA' } });
    } finally {
      jest.restoreAllMocks();
    }
  });
});

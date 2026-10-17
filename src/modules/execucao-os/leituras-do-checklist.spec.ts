import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService, PermissionScopeService } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import { TarefasService } from '../tarefas/tarefas.service';

/**
 * Leituras no checklist da OS (SN-58), contra Postgres de verdade.
 *
 * O passo da instrução pode ser LEITURA, com unidade e faixa. O item da OS
 * congela isso ao nascer; a equipe digita o valor (digitar marca, apagar
 * desmarca); fora da faixa não trava o item, mas a tarefa só fecha com a
 * observação dele.
 *
 * Roda com `npx jest --runInBand src/modules/execucao-os/leituras-do-checklist`.
 */
describe('leituras no checklist da OS (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);

  const PREFIXO = 'TESTE-LEITURAS-OS';
  const TAG_INSTRUCAO = 'TESTE-LEIT-INST-1';

  let instrucaoId: string;
  let tarefaId: string;
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const limpar = async () => {
    const progs = await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = progs.map((p) => p.id);
    const osIds = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } })).map((o) => o.id);
    await prisma.checklist_atividades_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...ids, ...osIds].map((i) => i.trim()) } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    await limpar();
    planta = await criarPlantaDeTeste(prisma, 'leiturasos', '95.000.000/0001-58');
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: 'TESTE-LEIT-' } } });
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao: { tag: TAG_INSTRUCAO } } });
    await prisma.instrucoes.deleteMany({ where: { tag: TAG_INSTRUCAO } });

    instrucaoId = (
      await prisma.instrucoes.create({
        data: {
          tag: TAG_INSTRUCAO,
          nome: 'Medição do inversor',
          descricao: 'Instrução de teste',
          categoria: 'ELETRICA',
          tipo_manutencao: 'PREVENTIVA',
          condicao_ativo: 'FUNCIONANDO',
          criticidade: 3,
          duracao_estimada: 1,
          tempo_estimado: 30,
        },
      })
    ).id;
    await prisma.sub_instrucoes.createMany({
      data: [
        { instrucao_id: instrucaoId, descricao: 'Desligar o disjuntor', ordem: 1, obrigatoria: true },
        { instrucao_id: instrucaoId, descricao: 'Tensão CC da string', ordem: 2, obrigatoria: true, tipo: 'LEITURA', unidade: 'V', valor_minimo: 580, valor_maximo: 620 },
        { instrucao_id: instrucaoId, descricao: 'Temperatura do dissipador', ordem: 3, tipo: 'LEITURA', unidade: '°C', valor_maximo: 70.5 },
      ],
    });
    tarefaId = (
      await prisma.tarefas.create({ data: { tag: 'TESTE-LEIT-T1', nome: 'Medir inversor', criticidade: 3, ordem: 1, instrucao_id: instrucaoId } })
    ).id.trim();
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: 'TESTE-LEIT-' } } });
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao: { tag: TAG_INSTRUCAO } } });
    await prisma.instrucoes.deleteMany({ where: { tag: TAG_INSTRUCAO } });
    await planta.apagar();
    await prisma.$disconnect();
  });

  /** Programação com a tarefa → aprovada → OS em execução, e os três itens dela. */
  const osEmExecucao = async () => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} programação`,
      condicoes: 'FUNCIONANDO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      origem: 'TAREFA',
      planta_id: planta.id,
      tarefas_ids: [tarefaId],
    } as never);
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);
    const vinculo = await prisma.tarefas_os.findFirstOrThrow({ where: { os_id: os.id } });
    const [disjuntor, tensao, temperatura] = await prisma.checklist_atividades_os.findMany({ where: { os_id: os.id }, orderBy: { ordem: 'asc' } });
    return { osId: os.id, vinculoId: vinculo.id, disjuntor, tensao, temperatura };
  };

  const item = (id: string) => prisma.checklist_atividades_os.findUniqueOrThrow({ where: { id } });

  it('o item nasce com o tipo, a unidade e a faixa do passo, e não muda se a instrução mudar depois', async () => {
    const { disjuntor, tensao, temperatura } = await osEmExecucao();

    expect(disjuntor).toMatchObject({ tipo: 'VERIFICACAO', unidade: null, valor_minimo: null, valor_maximo: null });
    expect(tensao).toMatchObject({ tipo: 'LEITURA', unidade: 'V' });
    expect([Number(tensao.valor_minimo), Number(tensao.valor_maximo)]).toEqual([580, 620]);
    expect([temperatura.valor_minimo, Number(temperatura.valor_maximo)]).toEqual([null, 70.5]);

    await prisma.sub_instrucoes.updateMany({ where: { instrucao_id: instrucaoId, ordem: 2 }, data: { valor_maximo: 700 } });
    expect(Number((await item(tensao.id)).valor_maximo)).toBe(620);
    await prisma.sub_instrucoes.updateMany({ where: { instrucao_id: instrucaoId, ordem: 2 }, data: { valor_maximo: 620 } });
  });

  it('digitar o valor marca a leitura; apagar (null) desmarca e limpa o valor', async () => {
    const { osId, tensao } = await osEmExecucao();

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, valor_lido: 601.25 }] });
    const lido = await item(tensao.id);
    expect(lido.concluida).toBe(true);
    expect(Number(lido.valor_lido)).toBe(601.25);
    expect(lido.concluida_em).not.toBeNull();

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, valor_lido: null }] });
    expect(await item(tensao.id)).toMatchObject({ concluida: false, valor_lido: null, concluida_em: null });
  });

  it('desmarcar a leitura (concluida: false) também limpa o valor', async () => {
    const { osId, tensao } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, valor_lido: 600 }] });

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, concluida: false }] });

    expect(await item(tensao.id)).toMatchObject({ concluida: false, valor_lido: null });
  });

  it.each([
    ['leitura marcada sem valor', (i: { tensao: { id: string } }) => ({ id: i.tensao.id, concluida: true })],
    ['leitura desmarcada e com valor', (i: { tensao: { id: string } }) => ({ id: i.tensao.id, concluida: false, valor_lido: 600 })],
    ['verificação com valor', (i: { disjuntor: { id: string } }) => ({ id: i.disjuntor.id, concluida: true, valor_lido: 1 })],
    ['verificação sem dizer se foi feita', (i: { disjuntor: { id: string } }) => ({ id: i.disjuntor.id })],
  ])('recusa (400): %s', async (_caso, pedido) => {
    const os = await osEmExecucao();

    await expect(execucoes.atualizarChecklist(os.osId, { atividades: [pedido(os)] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pedido recusado não grava nenhum item do lote (tudo na mesma transação)', async () => {
    const { osId, disjuntor, tensao } = await osEmExecucao();

    await expect(
      execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: true }, { id: tensao.id, concluida: true }] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect((await item(disjuntor.id)).concluida).toBe(false);
  });

  // Antes o updateMany pulava calado o item de outra OS, e a tela mostrava salvo
  it('item de outra OS é 404, não some calado', async () => {
    const primeira = await osEmExecucao();
    const segunda = await osEmExecucao();

    await expect(
      execucoes.atualizarChecklist(primeira.osId, { atividades: [{ id: segunda.disjuntor.id, concluida: true }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect((await item(segunda.disjuntor.id)).concluida).toBe(false);
  });

  it('a tarefa conclui com a leitura no limite da faixa (o limite faz parte dela)', async () => {
    const { osId, vinculoId, disjuntor, tensao } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, {
      atividades: [{ id: disjuntor.id, concluida: true }, { id: tensao.id, valor_lido: 620 }],
    });

    await execucoes.concluirTarefa(osId, vinculoId, {} as never);

    expect((await prisma.tarefas_os.findUniqueOrThrow({ where: { id: vinculoId } })).status).toBe('CONCLUIDA');
  });

  it('leitura obrigatória sem valor segura a tarefa como qualquer obrigatório', async () => {
    const { osId, vinculoId, disjuntor } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: true }] });

    await expect(execucoes.concluirTarefa(osId, vinculoId, {} as never)).rejects.toThrow(/1 item\(ns\) obrigatório/);
  });

  it('leitura fora da faixa sem observação segura a tarefa; com a observação, conclui', async () => {
    const { osId, vinculoId, disjuntor, tensao, temperatura } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, {
      atividades: [
        { id: disjuntor.id, concluida: true },
        { id: tensao.id, valor_lido: 600 },
        { id: temperatura.id, valor_lido: 82.3 },
      ],
    });

    const recusa = execucoes.concluirTarefa(osId, vinculoId, {} as never);
    await expect(recusa).rejects.toBeInstanceOf(ConflictException);
    await expect(recusa).rejects.toThrow('Temperatura do dissipador" ficou fora da faixa (82,3 °C; faixa: no máximo 70,5 °C)');

    await execucoes.atualizarChecklist(osId, {
      atividades: [{ id: temperatura.id, valor_lido: 82.3, observacoes: 'Ventilador travado; limpo e religado' }],
    });
    await execucoes.concluirTarefa(osId, vinculoId, {} as never);
    expect((await prisma.tarefas_os.findUniqueOrThrow({ where: { id: vinculoId } })).status).toBe('CONCLUIDA');
  });

  // A tela trava os itens da tarefa fechada; pela API dava para desmarcar o
  // obrigatório de uma tarefa já concluída
  it('item de tarefa já concluída não muda (409) até desfazer a tarefa', async () => {
    const { osId, vinculoId, disjuntor, tensao } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: true }, { id: tensao.id, valor_lido: 600 }] });
    await execucoes.concluirTarefa(osId, vinculoId, {} as never);

    await expect(
      execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: false }] }),
    ).rejects.toThrow(/já foi marcada como feita: desfaça/);

    await execucoes.reabrirTarefa(osId, vinculoId);
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: false }] });
    expect((await item(disjuntor.id)).concluida).toBe(false);
  });

  // Revisão do SN-58: explicar a leitura não é ler de novo
  it('gravar só a observação não mexe no valor nem em quem leu e quando', async () => {
    const { osId, temperatura } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: temperatura.id, valor_lido: 82 }] }, undefined);
    const lido = await item(temperatura.id);

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: temperatura.id, observacoes: 'Ventilador travado' }] }, undefined);

    const depois = await item(temperatura.id);
    expect(depois).toMatchObject({ concluida: true, observacoes: 'Ventilador travado', concluida_por: lido.concluida_por });
    expect(Number(depois.valor_lido)).toBe(82);
    expect(depois.concluida_em).toEqual(lido.concluida_em);
  });

  it('remarcar o que já estava marcado não troca o carimbo; mudar o valor troca', async () => {
    const { osId, disjuntor, tensao } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: true }, { id: tensao.id, valor_lido: 600 }] });
    const [d1, t1] = [await item(disjuntor.id), await item(tensao.id)];
    await new Promise((r) => setTimeout(r, 20));

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: true }, { id: tensao.id, valor_lido: 600 }] });
    expect((await item(disjuntor.id)).concluida_em).toEqual(d1.concluida_em);
    expect((await item(tensao.id)).concluida_em).toEqual(t1.concluida_em);

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, valor_lido: 605 }] });
    expect((await item(tensao.id)).concluida_em!.getTime()).toBeGreaterThan(t1.concluida_em!.getTime());
  });

  it('o mesmo item duas vezes no lote vira um pedido só (o segundo não apaga o valor do primeiro)', async () => {
    const { osId, temperatura } = await osEmExecucao();

    await execucoes.atualizarChecklist(osId, {
      atividades: [{ id: temperatura.id, valor_lido: 75 }, { id: `${temperatura.id} `, observacoes: 'Acima do máximo' }],
    });

    const gravado = await item(temperatura.id);
    expect([Number(gravado.valor_lido), gravado.observacoes, gravado.concluida]).toEqual([75, 'Acima do máximo', true]);
  });

  it('pedido sem nada para gravar é 400', async () => {
    const { osId, tensao } = await osEmExecucao();

    await expect(execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('concluir a tarefa que não está pendente é 409 (antes recarimbava a conclusão)', async () => {
    const { osId, vinculoId, disjuntor, tensao } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: true }, { id: tensao.id, valor_lido: 600 }] });
    await execucoes.concluirTarefa(osId, vinculoId, {} as never);

    await expect(execucoes.concluirTarefa(osId, vinculoId, {} as never)).rejects.toThrow(/não está pendente/);
  });

  // A trava: concluir e desmarcar ao mesmo tempo nunca deixam a tarefa feita
  // com o obrigatório desmarcado — um dos dois espera o outro e recusa
  it('concluir a tarefa e desmarcar um obrigatório juntos: um dos dois é recusado', async () => {
    for (let rodada = 0; rodada < 4; rodada++) {
      await limpar();
      const { osId, vinculoId, disjuntor, tensao } = await osEmExecucao();
      await execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: true }, { id: tensao.id, valor_lido: 600 }] });

      const [concluir, desmarcar] = await Promise.allSettled([
        execucoes.concluirTarefa(osId, vinculoId, {} as never),
        execucoes.atualizarChecklist(osId, { atividades: [{ id: disjuntor.id, concluida: false }] }),
      ]);

      expect([concluir.status, desmarcar.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
      const tarefa = await prisma.tarefas_os.findUniqueOrThrow({ where: { id: vinculoId } });
      const marcado = (await item(disjuntor.id)).concluida;
      expect(tarefa.status === 'CONCLUIDA' ? marcado : !marcado).toBe(true);
    }
  });

  it('a tarefa traz as etapas da instrução com o tipo e a faixa (o include voltava vazio no id de 25 caracteres)', async () => {
    expect(instrucaoId.trim()).toHaveLength(25);

    const tarefa = await new TarefasService(prisma, scope, {} as PropagacaoPlanosService).buscarPorId(tarefaId);

    expect(tarefa.instrucao?.sub_instrucoes?.map((e) => [e.descricao, e.tipo, e.unidade, e.valor_minimo, e.valor_maximo])).toEqual([
      ['Desligar o disjuntor', 'VERIFICACAO', null, null, null],
      ['Tensão CC da string', 'LEITURA', 'V', 580, 620],
      ['Temperatura do dissipador', 'LEITURA', '°C', null, 70.5],
    ]);
  });

  it('a resposta da OS traz a leitura em número e o fora da faixa já contado', async () => {
    const { osId, tensao, temperatura } = await osEmExecucao();
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, valor_lido: 600 }, { id: temperatura.id, valor_lido: 71 }] });

    const os = (await execucoes.buscarPorId(osId)) as unknown as {
      checklist: Array<{ id: string; tipo: string; unidade: string | null; valor_lido: number | null; valor_minimo: number | null; valor_maximo: number | null; fora_da_faixa: boolean }>;
    };
    const porId = new Map(os.checklist.map((c) => [c.id, c]));

    expect(porId.get(tensao.id)).toMatchObject({ tipo: 'LEITURA', unidade: 'V', valor_lido: 600, valor_minimo: 580, valor_maximo: 620, fora_da_faixa: false });
    expect(porId.get(temperatura.id)).toMatchObject({ valor_lido: 71, valor_minimo: null, valor_maximo: 70.5, fora_da_faixa: true });
  });
});

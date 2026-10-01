import { ConflictException } from '@nestjs/common';
import { PrismaService, PermissionScopeService } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';

/**
 * O que se preenche durante a execução, contra Postgres de verdade
 * (docs/SPEC-EXECUCAO-DA-OS.md).
 *
 * O ponto central é o P1 da spec: a tela nunca concluía tarefa, então toda OS
 * de plano finalizava com as tarefas PENDENTE, o plano não registrava a
 * execução e o cron gerava o mesmo ciclo de novo. Agora:
 *   - cada item do checklist sabe a que tarefa pertence (tarefa_os_id);
 *   - concluir a tarefa exige os itens obrigatórios dela;
 *   - executar com tarefa pendente exige o motivo, e ela fica "não feita"
 *     (CANCELADA no vínculo) — continua devendo no plano, de propósito.
 *
 * Roda com `npx jest --runInBand src/modules/execucao-os/execucao-da-os`.
 */
describe('execução da OS: checklist por tarefa, concluir e executar (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);

  const PREFIXO = 'TESTE-EXECUCAO-OS';
  const TAG_INSTRUCAO = 'TESTE-EXEC-INST-1';

  let tarefaComItensId: string;
  let tarefaSemItensId: string;

  const limpar = async () => {
    const progs = await prisma.programacoes_os.findMany({
      where: { descricao: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const ids = progs.map((p) => p.id);
    const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } });
    const osIds = oss.map((o) => o.id);
    await prisma.checklist_atividades_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    await limpar();
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: 'TESTE-EXEC-' } } });
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao: { tag: TAG_INSTRUCAO } } });
    await prisma.instrucoes.deleteMany({ where: { tag: TAG_INSTRUCAO } });

    const instrucao = await prisma.instrucoes.create({
      data: {
        tag: TAG_INSTRUCAO,
        nome: 'Lubrificação do mancal',
        descricao: 'Instrução de teste',
        categoria: 'MECANICA',
        tipo_manutencao: 'PREVENTIVA',
        condicao_ativo: 'PARADO',
        criticidade: 3,
        duracao_estimada: 1,
        tempo_estimado: 30,
      },
    });
    await prisma.sub_instrucoes.createMany({
      data: [
        { instrucao_id: instrucao.id, descricao: 'Limpar o mancal', ordem: 1, obrigatoria: true },
        { instrucao_id: instrucao.id, descricao: 'Aplicar graxa', ordem: 2, obrigatoria: true },
        { instrucao_id: instrucao.id, descricao: 'Fotografar', ordem: 3, obrigatoria: false },
      ],
    });

    tarefaComItensId = (await prisma.tarefas.create({
      data: { tag: 'TESTE-EXEC-T1', nome: 'Lubrificar mancal', criticidade: 3, ordem: 1, instrucao_id: instrucao.id },
    })).id.trim();
    tarefaSemItensId = (await prisma.tarefas.create({
      data: { tag: 'TESTE-EXEC-T2', nome: 'Inspeção visual', criticidade: 2, ordem: 2 },
    })).id.trim();
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: 'TESTE-EXEC-' } } });
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao: { tag: TAG_INSTRUCAO } } });
    await prisma.instrucoes.deleteMany({ where: { tag: TAG_INSTRUCAO } });
    await prisma.$disconnect();
  });

  /** Programação com as duas tarefas → aprovada → OS em execução (checklist gerado). */
  const osEmExecucao = async () => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} programação`,
      condicoes: 'PARADO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      origem: 'TAREFA',
      tarefas_ids: [tarefaComItensId, tarefaSemItensId],
    } as never);
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);
    const vinculos = await prisma.tarefas_os.findMany({ where: { os_id: os.id }, orderBy: { ordem: 'asc' } });
    return { osId: os.id, comItens: vinculos[0], semItens: vinculos[1] };
  };

  const itensDaTarefa = (osId: string, tarefaOsId: string) =>
    prisma.checklist_atividades_os.findMany({ where: { os_id: osId, tarefa_os_id: tarefaOsId }, orderBy: { ordem: 'asc' } });

  it('iniciar gera o checklist com cada item ligado à sua tarefa, sem itens gerais', async () => {
    const { osId, comItens } = await osEmExecucao();

    const daTarefa = await itensDaTarefa(osId, comItens.id);
    expect(daTarefa.map((i) => i.obrigatoria)).toEqual([true, true, false]);

    const gerais = await prisma.checklist_atividades_os.count({ where: { os_id: osId, tarefa_os_id: null } });
    expect(gerais).toBe(0);
  });

  it('a resposta da OS traz o checklist com a tarefa de cada item', async () => {
    const { osId, comItens } = await osEmExecucao();

    const os = await execucoes.buscarPorId(osId);
    const doItem = (os as unknown as { checklist: { tarefa_os_id: string | null }[] }).checklist;
    expect(doItem.filter((i) => i.tarefa_os_id === comItens.id)).toHaveLength(3);
  });

  it('concluir tarefa com item obrigatório pendente é recusado', async () => {
    const { osId, comItens } = await osEmExecucao();

    await expect(execucoes.concluirTarefa(osId, comItens.id, {} as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('com os obrigatórios marcados, a tarefa conclui (pelo id do vínculo)', async () => {
    const { osId, comItens } = await osEmExecucao();
    const itens = await itensDaTarefa(osId, comItens.id);
    await execucoes.atualizarChecklist(osId, {
      atividades: itens.filter((i) => i.obrigatoria).map((i) => ({ id: i.id, concluida: true })),
    } as never);

    await execucoes.concluirTarefa(osId, comItens.id, {} as never);

    const vinculo = await prisma.tarefas_os.findUniqueOrThrow({ where: { id: comItens.id } });
    expect(vinculo.status).toBe('CONCLUIDA');
    expect(vinculo.data_conclusao).not.toBeNull();
  });

  it('tarefa sem itens conclui com o clique', async () => {
    const { osId, semItens } = await osEmExecucao();

    await execucoes.concluirTarefa(osId, semItens.id, {} as never);

    expect((await prisma.tarefas_os.findUniqueOrThrow({ where: { id: semItens.id } })).status).toBe('CONCLUIDA');
  });

  it('reabrir a tarefa concluída volta para pendente', async () => {
    const { osId, semItens } = await osEmExecucao();
    await execucoes.concluirTarefa(osId, semItens.id, {} as never);

    await execucoes.reabrirTarefa(osId, semItens.id);

    const vinculo = await prisma.tarefas_os.findUniqueOrThrow({ where: { id: semItens.id } });
    expect(vinculo.status).toBe('PENDENTE');
    expect(vinculo.data_conclusao).toBeNull();
  });

  it('executar com tarefa pendente sem motivo é recusado', async () => {
    const { osId, semItens } = await osEmExecucao();
    await execucoes.concluirTarefa(osId, semItens.id, {} as never);

    await expect(
      execucoes.executar(osId, { resultado_servico: 'Feito em parte' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('executar com o motivo deixa a tarefa como não feita, com o motivo registrado', async () => {
    const { osId, comItens, semItens } = await osEmExecucao();
    await execucoes.concluirTarefa(osId, semItens.id, {} as never);

    await execucoes.executar(osId, {
      resultado_servico: 'Feito em parte',
      tarefas_nao_feitas: [{ id: comItens.id, motivo: 'Faltou a graxa' }],
    } as never);

    const vinculo = await prisma.tarefas_os.findUniqueOrThrow({ where: { id: comItens.id } });
    expect(vinculo.status).toBe('CANCELADA');
    expect(vinculo.observacoes).toBe('Faltou a graxa');
    expect((await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } })).status).toBe('EXECUTADA');
  });

  it('checklist e tarefas só mudam com a OS em execução', async () => {
    const { osId, semItens } = await osEmExecucao();
    await execucoes.concluirTarefa(osId, semItens.id, {} as never);
    await execucoes.executar(osId, {
      resultado_servico: 'ok',
      tarefas_nao_feitas: [{ id: (await prisma.tarefas_os.findFirstOrThrow({ where: { os_id: osId, status: 'PENDENTE' } })).id, motivo: 'x' }],
    } as never);

    await expect(execucoes.reabrirTarefa(osId, semItens.id)).rejects.toBeInstanceOf(ConflictException);
  });
});

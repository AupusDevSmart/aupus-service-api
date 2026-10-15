import { PermissionScopeService, PrismaService } from '@/core';
import { ProgramacaoOSService } from './programacao-os.service';
import { ExecucaoOSService } from '../execucao-os/execucao-os.service';

/**
 * A preventiva (programação e OS de origem TAREFA) com a planta das tarefas
 * (SN-33). Sem ela, o técnico e o cliente — que enxergam pela planta — nunca
 * viam nenhuma preventiva: no dev, 33 de 33 OS de tarefa estavam sem planta.
 * Contra Postgres real, com o escopo de verdade.
 */
describe('planta da programação e da OS de tarefa (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const programacoes = new ProgramacaoOSService(prisma, escopo);
  const execucoes = new ExecucaoOSService(prisma, escopo);

  const ID = (s: string) => `testeplantaos${s}`.padEnd(26, '0').slice(0, 26);
  const DONO = ID('dono');
  const TECNICO_A = ID('tecnicoa');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UNIDADE_B = ID('unidadeb');
  const UC_A = ID('uca');
  const UAR_A = ID('uara');
  const UC_B = ID('ucb');
  const PREFIXO = 'TESTE-PLANTA-OS';

  const tecnicoA = { id: TECNICO_A, role: 'operador' };
  const tecnicoB = { id: TECNICO_B, role: 'operador' };
  let tarefaUC: string;
  let tarefaUAR: string;
  let tarefaB: string;

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    const oss = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs } }, select: { id: true } })).map((o) => o.id);
    await prisma.historico_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
  };

  const planta = (id: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
  const unidade = (id: string, plantaId: string) =>
    prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `${PREFIXO} ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });

  const apagarFixos = async () => {
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR_A, UC_A, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: { in: [TECNICO_A, TECNICO_B] } } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, TECNICO_A, TECNICO_B] } } });
  };

  beforeAll(async () => {
    await limpar();
    await apagarFixos();
    for (const id of [DONO, TECNICO_A, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@planta-os.teste` } });
    await planta(PLANTA_A, '97.000.000/0001-01');
    await planta(PLANTA_B, '97.000.000/0001-02');
    await prisma.planta_operadores.createMany({ data: [{ usuario_id: TECNICO_A, planta_id: PLANTA_A }, { usuario_id: TECNICO_B, planta_id: PLANTA_B }] });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    // UAR não tem unidade própria: a planta vem do UC pai
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha do inversor', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });
    const tarefa = (tag: string, equipamentoId: string) =>
      prisma.tarefas.create({ data: { tag: `${PREFIXO}-${tag}`, nome: tag, criticidade: 3, ordem: 1, equipamento_id: equipamentoId } });
    tarefaUC = (await tarefa('UC', UC_A)).id.trim();
    tarefaUAR = (await tarefa('UAR', UAR_A)).id.trim();
    tarefaB = (await tarefa('B', UC_B)).id.trim();
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await apagarFixos();
    await prisma.$disconnect();
  });

  const gerar = (tarefas: string[]) =>
    programacoes.criarDeTarefas({ tarefas_ids: tarefas, descricao: `${PREFIXO} cron`, agrupar_por: 'planta' } as never);

  it('a programação de tarefa grava a planta das tarefas (o componente pela unidade do pai)', async () => {
    const prog = await gerar([tarefaUC, tarefaUAR]);

    const salva = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: prog.id } });
    expect(salva.planta_id?.trim()).toBe(PLANTA_A);
  });

  it('tarefas de duas plantas: recusa, em vez de gravar a programação sem planta (SN-35)', async () => {
    await expect(gerar([tarefaUC, tarefaB])).rejects.toThrow(/2 plantas/);
    expect(await prisma.programacoes_os.count({ where: { descricao: { startsWith: PREFIXO } } })).toBe(0);
  });

  it('aprovar leva a planta para a OS, e o técnico da planta vê a OS e a programação', async () => {
    const prog = await gerar([tarefaUC]);
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    expect(os.planta_id?.trim()).toBe(PLANTA_A);

    const listaA = await execucoes.listar({ page: 1, limit: 100 } as never, tecnicoA);
    expect(listaA.data.map((o: { id: string }) => o.id.trim())).toContain(os.id.trim());
    const listaB = await execucoes.listar({ page: 1, limit: 100 } as never, tecnicoB);
    expect(listaB.data.map((o: { id: string }) => o.id.trim())).not.toContain(os.id.trim());

    await expect(escopo.assertEntityInScope('ordem_servico', os.id, tecnicoA)).resolves.toBeUndefined();
  });

  it('OS antiga, sem planta gravada, ainda vale pela planta das tarefas', async () => {
    const prog = await gerar([tarefaUAR]);
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await prisma.ordens_servico.update({ where: { id: os.id }, data: { planta_id: null, equipamento_id: null } });
    await prisma.programacoes_os.update({ where: { id: prog.id }, data: { planta_id: null, equipamento_id: null } });

    await expect(escopo.assertEntityInScope('ordem_servico', os.id, tecnicoA)).resolves.toBeUndefined();
    await expect(escopo.assertEntityInScope('programacao_os', prog.id, tecnicoA)).resolves.toBeUndefined();
    await expect(escopo.assertEntityInScope('ordem_servico', os.id, tecnicoB)).rejects.toThrow();
  });
});

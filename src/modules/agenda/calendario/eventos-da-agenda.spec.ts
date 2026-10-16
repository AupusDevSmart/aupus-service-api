import { BadRequestException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { criarPlantaDeTeste } from '../../../../test/planta-de-teste';
import { proximoDiaUtil, regraDeDiasUteis } from '../dias-uteis';
import { PrevisaoDaAgendaService } from '../previsao/previsao-da-agenda.service';
import { EventosDaAgendaController } from './eventos-da-agenda.controller';
import { EventosDaAgendaService, type EventoDaAgenda } from './eventos-da-agenda.service';

/**
 * O calendário de manutenção (SN-52), contra Postgres real: programações a
 * aprovar, OS e a previsão do gerador num período, cada um com a sua situação,
 * sem duplicar o que já está programado e só nas plantas de quem pede.
 */
describe('eventos da agenda (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const eventos = new EventosDaAgendaService(prisma, escopo, new PrevisaoDaAgendaService(prisma, escopo));
  const DIA = 86_400_000;
  // No segundo cheio: as datas são TIMESTAMP(0)
  const agora = new Date(Math.floor(Date.now() / 1000) * 1000);
  const ID = (s: string) => `testecal${s}`.padEnd(26, '0').slice(0, 26);
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const OUTRO_UC = ID('outrouc');
  const SEM_PLANTA = ID('semplanta');
  const TECNICO_FORA = ID('tecnicofora');
  const PREFIXO = 'TESTE-CAL';
  // O dono da planta de teste (criarPlantaDeTeste): o cliente
  const donoDe = (nome: string) => `dono${nome}`.padEnd(26, '0').slice(0, 26);
  const TODAS = ['manutencao.view', 'execucao_os.view', 'programacao_os.view'];
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let outraPlanta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let tarefaPrevista = '';
  const os: Record<string, string> = {};
  let programacaoPendente = '';

  const apagar = async () => {
    const progs = await prisma.programacoes_os.findMany({ where: { codigo: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = progs.map((p) => p.id);
    const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: oss.map((o) => o.id) } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss.map((o) => o.id) } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.configuracoes_dias_uteis.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC, OUTRO_UC, SEM_PLANTA] } } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_FORA } });
    await prisma.usuarios.deleteMany({ where: { id: TECNICO_FORA } });
  };

  const programacao = (sufixo: string, dados: Record<string, unknown>) =>
    prisma.programacoes_os.create({
      data: {
        codigo: `${PREFIXO}-${sufixo}`, descricao: `${PREFIXO} ${sufixo}`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', origem: 'MANUAL',
        tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(), ...dados,
      },
    });
  const ordem = async (sufixo: string, status: string, emDias: number, dados: Record<string, unknown> = {}) => {
    const prog = await programacao(`P-${sufixo}`, { status: 'APROVADA' });
    const criada = await prisma.ordens_servico.create({
      data: {
        programacao_id: prog.id, numero_os: `${PREFIXO}-${sufixo}`, descricao: `OS ${sufixo}`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA',
        prioridade: 'MEDIA', origem: 'MANUAL', tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, status: status as never,
        data_hora_programada: new Date(agora.getTime() + emDias * DIA), atualizado_em: new Date(), ...dados,
      },
    });
    return criada.id;
  };

  beforeAll(async () => {
    planta = await criarPlantaDeTeste(prisma, 'calendario', '83.300.000/0001-01');
    outraPlanta = await criarPlantaDeTeste(prisma, 'calendariooutra', '83.300.000/0001-02');
    await apagar();
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: planta.id, nome: 'TESTE-CAL usina', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor CAL', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    await prisma.equipamentos.create({ data: { id: OUTRO_UC, nome: 'Outro CAL', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    await prisma.equipamentos.create({ data: { id: SEM_PLANTA, nome: 'Sem planta CAL', classificacao: 'UC', criticidade: '3' } });

    // Vence em 20 dias, ainda sem programação: a previsão
    tarefaPrevista = (
      await prisma.tarefas.create({
        data: { tag: `${PREFIXO}-MENSAL`, nome: 'Limpeza CAL', criticidade: 3, ordem: 1, equipamento_id: UC, frequencia: 'MENSAL', data_ancora: new Date(agora.getTime() - 10 * DIA) },
      })
    ).id.trim();

    os.aFazer = await ordem('AFAZER', 'PENDENTE', 5);
    os.atrasada = await ordem('ATRASADA', 'PENDENTE', -3);
    os.emExecucao = await ordem('EMEXEC', 'EM_EXECUCAO', 1);
    os.feita = await ordem('FEITA', 'FINALIZADA', -1);
    os.cancelada = await ordem('CANCELADA', 'CANCELADA', 2);
    os.corretiva = await ordem('CORRETIVA', 'PENDENTE', 7, { tipo: 'CORRETIVA' });
    // A OS do outro equipamento: o equipamento vem congelado na tarefa da OS
    os.doOutro = await ordem('OUTROEQ', 'PENDENTE', 8);
    await prisma.tarefas_os.create({ data: { os_id: os.doOutro, ordem: 1, status: 'PENDENTE', equipamento_id: OUTRO_UC, nome_snapshot: 'x' } });
    programacaoPendente = (await programacao('PENDENTE', { status: 'PENDENTE', data_hora_programada: new Date(agora.getTime() + 10 * DIA) })).id;

    await prisma.usuarios.create({ data: { id: TECNICO_FORA, nome: 'Técnico de fora', email: `${TECNICO_FORA}@cal.teste`, status: 'Ativo', is_active: true } });
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_FORA, planta_id: outraPlanta.id } });
  });

  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await outraPlanta.apagar();
    await prisma.$disconnect();
  });

  const periodo = { inicio: new Date(agora.getTime() - 10 * DIA), fim: new Date(agora.getTime() + 40 * DIA) };
  const desta = (lista: EventoDaAgenda[]) => lista.filter((e) => e.planta_id === planta.id);
  const doId = (lista: EventoDaAgenda[], id: string) => lista.find((e) => e.id === id);

  it('cada evento com a sua situação; a OS cancelada não entra', async () => {
    const { eventos: lista } = await eventos.listar({ ...periodo, plantaId: planta.id }, undefined, agora);

    expect(doId(lista, `os:${os.aFazer.trim()}`)).toMatchObject({ situacao: 'programado', link: `/execucao-os?execucaoId=${os.aFazer.trim()}` });
    expect(doId(lista, `os:${os.atrasada.trim()}`)?.situacao).toBe('atrasado');
    expect(doId(lista, `os:${os.emExecucao.trim()}`)?.situacao).toBe('em_execucao');
    expect(doId(lista, `os:${os.feita.trim()}`)?.situacao).toBe('feito');
    expect(doId(lista, `os:${os.cancelada.trim()}`)).toBeUndefined();
    expect(doId(lista, `programacao:${programacaoPendente.trim()}`)).toMatchObject({
      situacao: 'programado',
      link: `/programacao-os?programacaoId=${programacaoPendente.trim()}`,
    });
    const previsto = lista.find((e) => e.origem === 'previsao' && e.id.startsWith(`previsao:${tarefaPrevista}:`));
    expect(previsto).toMatchObject({ situacao: 'previsto', titulo: 'Limpeza CAL', link: null, previsao: expect.objectContaining({ tarefa_tag: `${PREFIXO}-MENSAL` }) });
    // Em ordem de data
    expect(lista.map((e) => e.data.getTime())).toEqual([...lista].map((e) => e.data.getTime()).sort((a, b) => a - b));
  });

  it('o ciclo já programado aparece pela programação, não duplicado na previsão', async () => {
    const auto = await programacao('AUTO', { status: 'PENDENTE', origem: 'TAREFA', data_hora_programada: new Date(agora.getTime() + 20 * DIA) });
    try {
      await prisma.tarefas_programacao_os.create({
        data: { programacao_id: auto.id, tarefa_id: tarefaPrevista, ordem: 1, status: 'PENDENTE', ciclo_referencia: new Date(agora.getTime() + 20 * DIA) },
      });

      const { eventos: lista } = await eventos.listar({ ...periodo, plantaId: planta.id }, undefined, agora);

      expect(lista.filter((e) => e.id.startsWith(`previsao:${tarefaPrevista}:`) && e.data.getTime() < agora.getTime() + 25 * DIA)).toEqual([]);
      expect(doId(lista, `programacao:${auto.id.trim()}`)).toBeDefined();
    } finally {
      await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: auto.id } });
      await prisma.programacoes_os.delete({ where: { id: auto.id } });
    }
  });

  it('filtro de tipo: corretiva não traz a previsão (que é sempre preventiva)', async () => {
    const { eventos: lista } = await eventos.listar({ ...periodo, plantaId: planta.id, tipo: 'CORRETIVA' }, undefined, agora);

    expect(desta(lista).map((e) => e.id)).toEqual([`os:${os.corretiva.trim()}`]);
  });

  it('filtro de equipamento acha a OS pela tarefa congelada', async () => {
    const { eventos: lista } = await eventos.listar({ ...periodo, equipamentoId: OUTRO_UC }, undefined, agora);

    expect(lista.map((e) => e.id)).toEqual([`os:${os.doOutro.trim()}`]);
  });

  it('as plantas do filtro são as do escopo de quem pede', async () => {
    const deFora = { id: TECNICO_FORA, role: 'operador' };

    expect((await eventos.listar(periodo, deFora, agora)).opcoes.plantas.map((p) => p.id)).toEqual([outraPlanta.id]);
    expect((await eventos.listar(periodo, undefined, agora)).opcoes.plantas.map((p) => p.id)).toEqual(expect.arrayContaining([planta.id, outraPlanta.id]));
  });

  it('o técnico de outra planta não vê nada desta, nem pedindo a planta pelo filtro', async () => {
    const deFora = { id: TECNICO_FORA, role: 'operador' };

    expect(desta((await eventos.listar(periodo, deFora, agora)).eventos)).toEqual([]);
    expect((await eventos.listar({ ...periodo, plantaId: planta.id }, deFora, agora)).eventos).toEqual([]);
  });

  it('o que venceu antes do período e continua por fazer vem contado, não some', async () => {
    const vencida = await prisma.tarefas.create({
      data: { tag: `${PREFIXO}-VENCIDA`, nome: 'Vencida CAL', criticidade: 3, ordem: 1, equipamento_id: UC, frequencia: 'MENSAL', data_ancora: new Date(agora.getTime() - 50 * DIA) },
    });
    try {
      // Período que começa depois de agora: a OS atrasada (-3 dias) e o ciclo vencido
      // (-20 dias) ficam antes dele; a OS a fazer (+5 dias) também, mas ainda não venceu
      const adiante = { inicio: new Date(agora.getTime() + 6 * DIA), fim: new Date(agora.getTime() + 40 * DIA) };
      expect((await eventos.listar({ ...adiante, plantaId: planta.id }, undefined, agora)).atrasados_antes).toBe(2);
      // No período que pega a OS atrasada, só o ciclo de -20 dias fica antes
      expect((await eventos.listar({ ...periodo, plantaId: planta.id }, undefined, agora)).atrasados_antes).toBe(1);
      // Quem não vê a planta não vê a conta dela
      expect((await eventos.listar({ ...adiante, plantaId: planta.id }, { id: TECNICO_FORA, role: 'operador' }, agora)).atrasados_antes).toBe(0);
    } finally {
      await prisma.tarefas.delete({ where: { id: vencida.id } });
    }
  });

  // O formulário grava a data em data_previsao_inicio (a hora segue comentada na
  // tela): pela data do gerador só, toda programação feita à mão sumia do calendário
  it('a programação do formulário aparece pela data prevista; a sem data nenhuma é contada à parte', async () => {
    const doFormulario = await programacao('FORM', { status: 'PENDENTE', data_previsao_inicio: new Date(agora.getTime() + 12 * DIA) });
    const semData = await programacao('SEMDATA', { status: 'PENDENTE' });
    try {
      const calendario = await eventos.listar({ ...periodo, plantaId: planta.id }, undefined, agora);

      expect(doId(calendario.eventos, `programacao:${doFormulario.id.trim()}`)).toMatchObject({ situacao: 'programado', data: new Date(agora.getTime() + 12 * DIA) });
      expect(doId(calendario.eventos, `programacao:${semData.id.trim()}`)).toBeUndefined();
      expect(calendario.sem_data).toBe(1);
    } finally {
      await prisma.programacoes_os.deleteMany({ where: { id: { in: [doFormulario.id, semData.id] } } });
    }
  });

  // A previsão escolhe pelo ciclo e desenha no próximo dia útil: o ciclo de dia
  // sem expediente na borda do período sumia das duas semanas
  it('a preventiva que vence em dia sem expediente aparece no próximo dia útil, também quando ele cai no período seguinte', async () => {
    const daTarefa = (lista: EventoDaAgenda[]) => lista.filter((e) => e.id.startsWith(`previsao:${tarefaPrevista}:`));
    const ciclo = new Date(daTarefa((await eventos.listar({ ...periodo, plantaId: planta.id }, undefined, agora)).eventos)[0].previsao!.ciclo);
    // A planta só trabalha no dia da semana (em Brasília) três dias depois do ciclo
    const diaDaSemana = new Date(ciclo.getTime() - 3 * 3_600_000).getUTCDay();
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
    await prisma.configuracoes_dias_uteis.create({
      data: {
        nome: `${PREFIXO} um dia por semana`, geral: false,
        ...Object.fromEntries(dias.map((nome, i) => [nome, i === (diaDaSemana + 3) % 7])),
        configuracao_plantas: { create: { planta_id: planta.id } },
      },
    });
    const saiEm = proximoDiaUtil(ciclo, await regraDeDiasUteis(prisma, planta.id));
    expect(saiEm.getTime()).toBeGreaterThan(ciclo.getTime() + DIA);

    const comOCiclo = await eventos.listar({ inicio: new Date(ciclo.getTime() - DIA), fim: new Date(saiEm.getTime() - 3_600_000), plantaId: planta.id }, undefined, agora);
    const comODiaUtil = await eventos.listar({ inicio: new Date(saiEm.getTime() - 3_600_000), fim: new Date(saiEm.getTime() + DIA), plantaId: planta.id }, undefined, agora);

    expect(daTarefa(comOCiclo.eventos)).toEqual([]);
    expect(daTarefa(comODiaUtil.eventos)).toEqual([expect.objectContaining({ data: saiEm, previsao: expect.objectContaining({ ciclo }) })]);
  });

  // A rota é de quem vê manutenção; a permissão direta pode dar essa sem as outras
  it('OS só para quem vê OS, programação só para quem vê programação', async () => {
    const soManutencao = { id: ID('analista'), role: 'analista', permissions: ['manutencao.view'] };
    const comOS = { ...soManutencao, permissions: ['manutencao.view', 'execucao_os.view'] };

    const origens = async (user: typeof soManutencao) => new Set((await eventos.listar({ ...periodo, plantaId: planta.id }, user, agora)).eventos.map((e) => e.origem));

    expect(await origens(soManutencao)).toEqual(new Set(['previsao']));
    expect(await origens(comOS)).toEqual(new Set(['previsao', 'os']));
  });

  it('o cliente vê a planta dele e o de outra não; o técnico de fora não vê nada nem pedindo o equipamento desta', async () => {
    const dono = { id: donoDe('calendario'), role: 'proprietario', permissions: TODAS };
    const outroDono = { id: donoDe('calendariooutra'), role: 'proprietario', permissions: TODAS };
    const deFora = { id: TECNICO_FORA, role: 'operador', permissions: TODAS };

    expect(doId((await eventos.listar(periodo, dono, agora)).eventos, `os:${os.aFazer.trim()}`)).toBeDefined();
    expect(desta((await eventos.listar(periodo, outroDono, agora)).eventos)).toEqual([]);
    expect((await eventos.listar({ ...periodo, equipamentoId: UC }, deFora, agora)).eventos).toEqual([]);
  });

  it('tarefa de equipamento sem planta aparece como "não sai", com o motivo', async () => {
    await prisma.tarefas.create({
      data: { tag: `${PREFIXO}-SEMPLANTA`, nome: 'Sem planta CAL', criticidade: 3, ordem: 1, equipamento_id: SEM_PLANTA, frequencia: 'MENSAL', data_ancora: agora },
    });

    const { eventos: lista } = await eventos.listar({ ...periodo, equipamentoId: SEM_PLANTA }, undefined, agora);

    expect(lista[0]).toMatchObject({ origem: 'previsao', situacao: 'nao_sai', planta_id: null, motivo: expect.stringContaining('planta') });
  });

  it('mais de 2.000 programações no período é recusado (estreitar ou filtrar), em vez de cortar calado', async () => {
    await prisma.programacoes_os.createMany({
      data: Array.from({ length: 2_001 }, (_, i) => ({
        codigo: `${PREFIXO}-MUITAS-${i}`, descricao: 'x', condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA' as const, origem: 'MANUAL' as const,
        tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(), data_hora_programada: new Date(agora.getTime() + DIA),
      })),
    });
    try {
      await expect(eventos.listar({ ...periodo, plantaId: planta.id }, undefined, agora)).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      await prisma.programacoes_os.deleteMany({ where: { codigo: { startsWith: `${PREFIXO}-MUITAS-` } } });
    }
  });

  describe('período', () => {
    const controller = new EventosDaAgendaController(eventos);

    it.each([
      ['2026-02-31', '2026-03-05', 'dia que não existe'],
      ['2026-11-10', '2026-11-01', 'fim antes do início'],
      ['2026-01-01', '2026-06-01', 'mais de 100 dias'],
    ])('%s a %s é recusado (%s)', (inicio, fim) => {
      expect(() => controller.listar({ inicio, fim })).toThrow(BadRequestException);
    });
  });
});

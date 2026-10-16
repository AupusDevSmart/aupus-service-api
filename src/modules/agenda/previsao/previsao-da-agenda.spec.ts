import { BadRequestException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { ProgramacaoOSService } from '../../programacao-os/programacao-os.service';
import { proximaRodadaDoGerador } from '../../tarefas/ciclos-das-tarefas';
import { TarefasSchedulerService } from '../../tarefas/tarefas-scheduler.service';
import { criarPlantaDeTeste } from '../../../../test/planta-de-teste';
import { PrevisaoDaAgendaController } from './previsao-da-agenda.controller';
import { MAXIMO_DE_ITENS, PrevisaoDaAgendaService, type CicloPrevisto } from './previsao-da-agenda.service';

/**
 * A previsão da agenda (SN-51) tem de dizer o que o gerador de preventivas VAI
 * fazer: aqui as duas coisas rodam sobre as mesmas tarefas, no Postgres real, e
 * têm de concordar — inclusive num "hoje" simulado no futuro. O gerador roda
 * só sobre os equipamentos do teste (o banco de teste tem outras tarefas).
 */
describe('previsão da agenda x gerador (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const previsao = new PrevisaoDaAgendaService(prisma, escopo);
  const escopoLivre = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const gerador = new TarefasSchedulerService(prisma, new ProgramacaoOSService(prisma, escopoLivre));

  const DIA = 86_400_000;
  const ID = (s: string) => `testeprev${s}`.padEnd(26, '0').slice(0, 26);
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const UAR = ID('uar');
  const UC_EXECUTADO = ID('ucexec');
  const SEM_PLANTA = ID('semplanta');
  const EXCLUIDO = ID('excluido');
  const UAR_DO_EXCLUIDO = ID('uardoexcluido');
  const UC_DIARIO = ID('ucdiario');
  const EQUIPAMENTOS = [UAR, UAR_DO_EXCLUIDO, UC, UC_EXECUTADO, SEM_PLANTA, EXCLUIDO, UC_DIARIO];
  const TECNICO_FORA = ID('tecnicofora');
  const PREFIXO = 'TESTE-PREV';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let outraPlanta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  // O dono da planta de teste (criarPlantaDeTeste): o cliente
  const donoDe = (nome: string) => `dono${nome}`.padEnd(26, '0').slice(0, 26);
  // No segundo cheio: data_ancora é TIMESTAMP(0) e arredonda os milissegundos
  const agora = new Date(Math.floor(Date.now() / 1000) * 1000);
  const tarefas: Record<'atrasada' | 'anual' | 'programada' | 'componente', string> = { atrasada: '', anual: '', programada: '', componente: '' };
  let programacaoDoTeste = '';

  const idsDasTarefasDoTeste = async () => (await prisma.tarefas.findMany({ where: { tag: { startsWith: PREFIXO } }, select: { id: true } })).map((t) => t.id);

  const apagarProgramacoes = async () => {
    const vinculos = await prisma.tarefas_programacao_os.findMany({ where: { tarefa_id: { in: await idsDasTarefasDoTeste() } }, select: { programacao_id: true } });
    const doTeste = await prisma.programacoes_os.findMany({ where: { codigo: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = [...new Set([...vinculos.map((v) => v.programacao_id), ...doTeste.map((p) => p.id)])];
    const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...ids, ...oss.map((o) => o.id)].map((i) => i.trim()) } } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: oss.map((o) => o.id) } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss.map((o) => o.id) } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
  };

  const apagar = async () => {
    await apagarProgramacoes();
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: EQUIPAMENTOS } } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_FORA } });
    await prisma.usuarios.deleteMany({ where: { id: TECNICO_FORA } });
  };

  const tarefa = (sufixo: string, equipamentoId: string, frequencia: string, ancora: Date) =>
    prisma.tarefas
      .create({ data: { tag: `${PREFIXO}-${sufixo}`, nome: `Tarefa ${sufixo}`, criticidade: 3, ordem: 1, equipamento_id: equipamentoId, frequencia: frequencia as never, data_ancora: ancora } })
      .then((t) => t.id.trim());

  beforeAll(async () => {
    planta = await criarPlantaDeTeste(prisma, 'previsao', '83.200.000/0001-01');
    outraPlanta = await criarPlantaDeTeste(prisma, 'previsaooutra', '83.200.000/0001-02');
    await apagar();
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: planta.id, nome: 'TESTE-PREV usina', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor PREV', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    await prisma.equipamentos.create({ data: { id: UAR, nome: 'Ventoinha PREV', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC } });
    await prisma.equipamentos.create({ data: { id: UC_EXECUTADO, nome: 'Executado PREV', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    await prisma.equipamentos.create({ data: { id: SEM_PLANTA, nome: 'Sem planta PREV', classificacao: 'UC', criticidade: '3' } });
    await prisma.equipamentos.create({ data: { id: EXCLUIDO, nome: 'Excluído PREV', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE, deleted_at: new Date() } });
    // Excluir a unidade só marca quem tem unidade_id: o componente do UC excluído fica vivo
    await prisma.equipamentos.create({ data: { id: UAR_DO_EXCLUIDO, nome: 'Componente do excluído PREV', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: EXCLUIDO } });
    await prisma.equipamentos.create({ data: { id: UC_DIARIO, nome: 'Diário PREV', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });

    tarefas.atrasada = await tarefa('ATRASADA', UC, 'MENSAL', new Date(agora.getTime() - 40 * DIA)); // venceu há 10 dias
    tarefas.anual = await tarefa('ANUAL', UC, 'ANUAL', new Date(agora.getTime() - 5 * DIA)); // vence em 360 dias
    tarefas.programada = await tarefa('PROGRAMADA', UC, 'SEMANAL', new Date(agora.getTime() - 3 * DIA)); // vence em 4 dias, já programada
    tarefas.componente = await tarefa('UAR', UAR, 'TRIMESTRAL', agora); // vence em 90 dias, no componente

    // O ciclo da semanal já tem programação aberta: o gerador não cria outra
    const prog = await prisma.programacoes_os.create({
      data: {
        codigo: `${PREFIXO}-ABERTA`, descricao: `${PREFIXO} aberta`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', origem: 'TAREFA',
        tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(),
        data_hora_programada: new Date(agora.getTime() + 5 * DIA),
      },
    });
    programacaoDoTeste = prog.id;
    await prisma.tarefas_programacao_os.create({
      data: { programacao_id: prog.id, tarefa_id: tarefas.programada, ordem: 1, status: 'PENDENTE', ciclo_referencia: new Date(agora.getTime() + 4 * DIA) },
    });

    await prisma.usuarios.create({ data: { id: TECNICO_FORA, nome: 'Técnico de fora', email: `${TECNICO_FORA}@prev.teste`, status: 'Ativo', is_active: true } });
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_FORA, planta_id: outraPlanta.id } });
  });

  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await outraPlanta.apagar();
    await prisma.$disconnect();
  });

  const periodo = (desde: Date, dias: number) => ({ inicio: new Date(desde.getTime() - 30 * DIA), fim: new Date(desde.getTime() + dias * DIA) });
  const primeiroDe = (itens: CicloPrevisto[], tarefaId: string) => itens.find((i) => i.tarefa_id === tarefaId);

  it('diz a situação de cada ciclo: atrasado, programado (com o item e a data dele) e previsto (com a rodada que o gera)', async () => {
    const { itens } = await previsao.prever({ ...periodo(agora, 365), equipamentoId: UC }, undefined, agora);

    expect(primeiroDe(itens, tarefas.atrasada)).toMatchObject({ situacao: 'atrasado', ciclo: new Date(agora.getTime() - 10 * DIA) });
    expect(primeiroDe(itens, tarefas.programada)).toMatchObject({
      situacao: 'programado',
      programacao_id: programacaoDoTeste.trim(),
      status_do_item: 'PENDENTE',
      // A data que vale é a da programação, não a estimada
      data_programada: new Date(agora.getTime() + 5 * DIA),
      data_programada_estimada: false,
      programacao_a_partir_de: null,
    });
    expect(primeiroDe(itens, tarefas.anual)).toMatchObject({
      situacao: 'previsto',
      ciclo: new Date(agora.getTime() + 360 * DIA),
      data_programada_estimada: true,
      programacao_a_partir_de: proximaRodadaDoGerador(new Date(agora.getTime() + 300 * DIA)),
    });
  });

  // O anterior venceu e não foi feito: o seguinte parte de agora, nunca "atrasado"
  // (a tela dizia atrasada enquanto o gerador via a tarefa em dia)
  it('os ciclos seguintes nunca saem atrasados e só saem depois do anterior', async () => {
    const { itens } = await previsao.prever({ ...periodo(agora, 365), equipamentoId: UC }, undefined, agora);
    const mensal = itens.filter((i) => i.tarefa_id === tarefas.atrasada);
    const semanal = itens.filter((i) => i.tarefa_id === tarefas.programada);

    expect(mensal[1]).toMatchObject({ situacao: 'previsto', ciclo: new Date(agora.getTime() + 30 * DIA) });
    expect(mensal.slice(1).every((i) => i.situacao === 'previsto')).toBe(true);
    // A semanal tem o ciclo de agora aberto até daqui a 4 dias: a seguinte não sai antes disso
    expect(semanal[1].programacao_a_partir_de!.getTime()).toBeGreaterThanOrEqual(agora.getTime() + 4 * DIA);
  });

  it('o gerador cria exatamente o que a previsão disse que sairia agora, com o mesmo ciclo', async () => {
    const antes = await previsao.prever({ ...periodo(agora, 120), equipamentoId: UC }, undefined, agora);
    const devemSair = new Map(
      [tarefas.atrasada, tarefas.anual, tarefas.programada, tarefas.componente]
        .map((id) => primeiroDe(antes.itens, id))
        .filter((i): i is CicloPrevisto => !!i && i.programacao_a_partir_de !== null && i.programacao_a_partir_de.getTime() <= proximaRodadaDoGerador(agora).getTime())
        .map((i) => [i.tarefa_id, i.ciclo.getTime()]),
    );
    expect([...devemSair.keys()]).toEqual([tarefas.atrasada]);

    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC, UAR] });

    const novos = await prisma.tarefas_programacao_os.findMany({
      where: { tarefa_id: { in: Object.values(tarefas) }, programacao_id: { not: programacaoDoTeste } },
      select: { tarefa_id: true, ciclo_referencia: true, programacao_id: true },
    });
    expect(new Map(novos.map((v) => [v.tarefa_id!.trim(), v.ciclo_referencia!.getTime()]))).toEqual(devemSair);

    const depois = await previsao.prever({ ...periodo(agora, 120), equipamentoId: UC }, undefined, agora);
    expect(primeiroDe(depois.itens, tarefas.atrasada)).toMatchObject({ situacao: 'programado', programacao_id: novos[0].programacao_id.trim() });
  });

  it('num hoje simulado no futuro, também concordam: o componente entra quando faltam 60 dias', async () => {
    const componente = primeiroDe((await previsao.prever({ ...periodo(agora, 120), equipamentoId: UC }, undefined, agora)).itens, tarefas.componente)!;
    const naRodada = componente.programacao_a_partir_de!;

    await gerador.gerarProgramacoesAutomaticas({ agora: naRodada, equipamentoIds: [UC, UAR] });

    const doComponente = await prisma.tarefas_programacao_os.findMany({ where: { tarefa_id: tarefas.componente }, select: { ciclo_referencia: true } });
    expect(doComponente.map((v) => v.ciclo_referencia!.getTime())).toEqual([componente.ciclo.getTime()]);
    expect(await prisma.tarefas_programacao_os.count({ where: { tarefa_id: tarefas.anual } })).toBe(0);
  });

  // O equipamento mudou de planta com a programação aberta: o ciclo segue
  // programado (o gerador não cria outra), mas quem tem escopo não vê o registro de fora
  it('o registro aberto de outra planta segura o ciclo, mas só quem vê a planta dele vê o registro', async () => {
    const mudou = await tarefa('MUDOU', UC, 'MENSAL', new Date(agora.getTime() - 40 * DIA));
    const deFora = await prisma.programacoes_os.create({
      data: {
        codigo: `${PREFIXO}-FORA`, descricao: 'x', condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', origem: 'TAREFA', tempo_estimado: 1, duracao_estimada: 1,
        planta_id: outraPlanta.id, atualizado_em: new Date(), data_hora_programada: new Date(agora.getTime() + 2 * DIA),
      },
    });
    await prisma.tarefas_programacao_os.create({
      data: { programacao_id: deFora.id, tarefa_id: mudou, ordem: 1, status: 'PENDENTE', ciclo_referencia: new Date(agora.getTime() - 10 * DIA) },
    });
    const dono = { id: donoDe('previsao'), role: 'proprietario' };

    const paraTodos = primeiroDe((await previsao.prever({ ...periodo(agora, 30), equipamentoId: UC }, undefined, agora)).itens, mudou);
    const paraODono = primeiroDe((await previsao.prever({ ...periodo(agora, 30), equipamentoId: UC }, dono, agora)).itens, mudou);

    expect(paraTodos).toMatchObject({ situacao: 'programado', programacao_id: deFora.id.trim(), data_programada: new Date(agora.getTime() + 2 * DIA) });
    expect(paraODono).toMatchObject({ situacao: 'programado', programacao_id: null, os_id: null, status_do_item: null, data_programada_estimada: true });
  });

  // TIMESTAMP(0) arredonda o ciclo gravado; o calculado de uma conclusão com
  // milissegundos não casava, e a mesma programação nascia toda noite
  it('depois de uma execução real (com milissegundos), o gerador rodado duas vezes não duplica', async () => {
    const executada = await tarefa('EXECUTADA', UC_EXECUTADO, 'SEMANAL', new Date(agora.getTime() - 30 * DIA));
    const prog = await prisma.programacoes_os.create({
      data: {
        codigo: `${PREFIXO}-FEITA`, descricao: 'x', condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', origem: 'TAREFA', status: 'FINALIZADA',
        tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(),
      },
    });
    const os = await prisma.ordens_servico.create({
      data: {
        programacao_id: prog.id, numero_os: `${PREFIXO}-FEITA`, descricao: 'x', condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', prioridade: 'MEDIA',
        origem: 'TAREFA', status: 'FINALIZADA', tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(),
      },
    });
    await prisma.tarefas_os.create({
      data: { os_id: os.id, tarefa_id: executada, ordem: 1, status: 'CONCLUIDA', data_conclusao: new Date(agora.getTime() - 8 * DIA + 640), nome_snapshot: 'x' },
    });

    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC_EXECUTADO] });
    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC_EXECUTADO] });

    expect(await prisma.tarefas_programacao_os.count({ where: { tarefa_id: executada, programacao_id: { not: prog.id } } })).toBe(1);
    const daExecutada = primeiroDe((await previsao.prever({ ...periodo(agora, 30), equipamentoId: UC_EXECUTADO }, undefined, agora)).itens, executada);
    expect(daExecutada?.situacao).toBe('programado');
  });

  it('tarefa de equipamento sem planta: "não sai", com o motivo — o gerador a põe nas falhas', async () => {
    await tarefa('SEMPLANTA', SEM_PLANTA, 'MENSAL', new Date(agora.getTime() - 40 * DIA));

    const { itens } = await previsao.prever({ ...periodo(agora, 30), equipamentoId: SEM_PLANTA }, undefined, agora);
    const { falhas } = await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [SEM_PLANTA] });

    expect(itens[0]).toMatchObject({ situacao: 'nao_sai', programacao_a_partir_de: null, motivo: expect.stringContaining('planta') });
    expect(falhas.flatMap((f) => f.tarefas)).toContain(`${PREFIXO}-SEMPLANTA`);
    // Venceu há 10 dias: num período adiante não aparece, mas é contado (não some calado)
    const adiante = await previsao.prever({ inicio: new Date(agora.getTime() + DIA), fim: new Date(agora.getTime() + 20 * DIA), equipamentoId: SEM_PLANTA }, undefined, agora);
    expect(adiante).toMatchObject({ itens: [], atrasados_antes: 1 });
  });

  it('equipamento excluído, nem o componente dele, tem previsão ou programação', async () => {
    await tarefa('EXCLUIDO', EXCLUIDO, 'MENSAL', new Date(agora.getTime() - 40 * DIA));
    await tarefa('UAR-EXCLUIDO', UAR_DO_EXCLUIDO, 'MENSAL', new Date(agora.getTime() - 40 * DIA));

    const { itens } = await previsao.prever(periodo(agora, 30), undefined, agora);
    const { programacoesCriadas } = await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [EXCLUIDO, UAR_DO_EXCLUIDO] });

    expect(itens.filter((i) => [EXCLUIDO, UAR_DO_EXCLUIDO].includes(i.equipamento_id))).toEqual([]);
    expect(programacoesCriadas).toBe(0);
  });

  describe('período longo e muitos ciclos', () => {
    it('período no futuro distante pula direto para lá (não percorre ciclo a ciclo)', async () => {
      await tarefa('DIARIA', UC_DIARIO, 'DIARIA', agora);
      const daqui10Anos = new Date(agora.getTime() + 3650 * DIA);
      const inicio = Date.now();

      const { itens } = await previsao.prever({ inicio: daqui10Anos, fim: new Date(daqui10Anos.getTime() + 30 * DIA), equipamentoId: UC_DIARIO }, undefined, agora);

      expect(itens.length).toBeGreaterThanOrEqual(30);
      expect(Date.now() - inicio).toBeLessThan(2_000);
    });

    it(`mais de ${MAXIMO_DE_ITENS} ciclos é recusado (estreitar ou filtrar), em vez de cortar calado`, async () => {
      for (let i = 0; i < 13; i++) await tarefa(`DIARIA-${i}`, UC_DIARIO, 'DIARIA', agora);

      await expect(previsao.prever({ inicio: agora, fim: new Date(agora.getTime() + 399 * DIA), equipamentoId: UC_DIARIO }, undefined, agora)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('filtros e escopo', () => {
    it('o equipamento inclui as tarefas dos componentes dele', async () => {
      const { itens } = await previsao.prever({ ...periodo(agora, 120), equipamentoId: UC }, undefined, agora);

      expect(new Set(itens.map((i) => i.tarefa_id))).toContain(tarefas.componente);
    });

    it('o cliente vê a planta dele; o de outra planta não vê nada desta', async () => {
      const dono = { id: donoDe('previsao'), role: 'proprietario' };
      const outroDono = { id: donoDe('previsaooutra'), role: 'proprietario' };

      expect((await previsao.prever({ ...periodo(agora, 120), equipamentoId: UC }, dono, agora)).itens.length).toBeGreaterThan(0);
      expect((await previsao.prever(periodo(agora, 120), outroDono, agora)).itens).toEqual([]);
    });

    it('o técnico de outra planta não vê nada, nem pedindo a planta ou o equipamento desta', async () => {
      const deFora = { id: TECNICO_FORA, role: 'operador' };

      expect((await previsao.prever(periodo(agora, 120), deFora, agora)).itens).toEqual([]);
      expect((await previsao.prever({ ...periodo(agora, 120), plantaId: planta.id }, deFora, agora)).itens).toEqual([]);
      expect((await previsao.prever({ ...periodo(agora, 120), equipamentoId: UC }, deFora, agora)).itens).toEqual([]);
    });

    it('quem tem escopo não vê tarefa sem planta', async () => {
      const dono = { id: donoDe('previsao'), role: 'proprietario' };

      expect((await previsao.prever({ ...periodo(agora, 30), equipamentoId: SEM_PLANTA }, dono, agora)).itens).toEqual([]);
    });

    it('filtro de outra planta não traz as tarefas desta', async () => {
      const { itens } = await previsao.prever({ ...periodo(agora, 120), plantaId: outraPlanta.id }, undefined, agora);

      expect(itens.filter((i) => Object.values(tarefas).includes(i.tarefa_id))).toEqual([]);
    });
  });

  describe('período', () => {
    const controller = new PrevisaoDaAgendaController(previsao);

    it.each([
      ['2026-11-10', '2026-11-01'],
      ['2026-01-01', '2027-03-01'],
      ['2026-02-31', '2026-03-10'],
    ])('%s a %s é recusado', (inicio, fim) => {
      expect(() => controller.prever({ inicio, fim })).toThrow(BadRequestException);
    });
  });
});

describe('proximaRodadaDoGerador (3h de Brasília)', () => {
  it.each([
    ['2026-10-16T05:59:59.000Z', '2026-10-16T06:00:00.000Z'],
    ['2026-10-16T06:00:00.000Z', '2026-10-16T06:00:00.000Z'],
    ['2026-10-16T06:00:01.000Z', '2026-10-17T06:00:00.000Z'],
    // 23h de Brasília do dia 15 (02h UTC do 16): a rodada é às 3h do dia 16
    ['2026-10-16T02:00:00.000Z', '2026-10-16T06:00:00.000Z'],
  ])('%s → %s', (instante, rodada) => {
    expect(proximaRodadaDoGerador(new Date(instante)).toISOString()).toBe(rodada);
  });
});

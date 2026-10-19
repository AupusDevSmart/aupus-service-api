import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { PrismaService, PermissionScopeService } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { dadosDeFalha, equipamentoDaCorretiva, minutosParado, mudancasNaFalha } from './dados-de-falha';
import { ExecutarOSDto } from './dto/os-actions.dto';

/**
 * Dados de falha na OS (SN-60). Na corretiva, sintoma, causa e ação são
 * obrigatórios e é preciso dizer se o equipamento parou; só quem parou tem
 * parada (exigir de toda corretiva obrigava a inventar uma: a anomalia nasce
 * "funcionando"). Quando parou e voltou são opcionais (19/out/2026), e por isso
 * a resposta "parou?" é gravada. Nos outros tipos, tudo opcional; a parada vai
 * inteira em qualquer tipo.
 */
const agora = new Date('2026-10-16T15:00:00.000Z');
const descricao = {
  falha_sintoma: 'Inversor desligado, alarme de sobretemperatura',
  falha_causa: 'Ventilador travado por poeira',
  falha_acao: 'Ventilador limpo e lubrificado; inversor religado',
};
const parou = {
  equipamento_parou: true,
  parada_inicio: '2026-10-16T11:20:00.000Z',
  parada_fim: '2026-10-16T13:05:00.000Z',
  ...descricao,
};

describe('dados de falha (regra)', () => {
  it('na corretiva, é preciso dizer se o equipamento parou', () => {
    expect(() => dadosDeFalha('CORRETIVA', descricao, agora)).toThrow('diga se o equipamento parou');
  });

  it('parou: sintoma, causa e ação; a mensagem diz o que falta', () => {
    expect(() => dadosDeFalha('CORRETIVA', { equipamento_parou: true }, agora)).toThrow(
      'Na corretiva, informe o sintoma, a causa e a ação tomada.',
    );
    expect(() => dadosDeFalha('CORRETIVA', { ...parou, falha_causa: '  ' }, agora)).toThrow('Na corretiva, informe a causa.');
    expect(dadosDeFalha('CORRETIVA', parou, agora)).toMatchObject({ equipamento_parou: true, falha_causa: 'Ventilador travado por poeira' });
  });

  // Decisão do usuário (19/out/2026): o técnico nem sempre sabe a hora
  it('parou sem horário: passa, e o "sim" fica gravado (sem ele, igual a não parou)', () => {
    expect(dadosDeFalha('CORRETIVA', { equipamento_parou: true, ...descricao }, agora)).toMatchObject({
      equipamento_parou: true,
      parada_inicio: null,
      parada_fim: null,
    });
    expect(() => dadosDeFalha('CORRETIVA', { equipamento_parou: true, ...descricao, parada_inicio: parou.parada_inicio }, agora)).toThrow('os dois');
  });

  it('não parou: sem parada, mas com sintoma, causa e ação; data de parada é recusada', () => {
    expect(dadosDeFalha('CORRETIVA', { equipamento_parou: false, ...descricao }, agora)).toMatchObject({
      equipamento_parou: false,
      parada_inicio: null,
      parada_fim: null,
      falha_acao: descricao.falha_acao,
    });
    expect(() => dadosDeFalha('CORRETIVA', { equipamento_parou: false }, agora)).toThrow('o sintoma, a causa e a ação tomada');
    expect(() => dadosDeFalha('CORRETIVA', { ...parou, equipamento_parou: false }, agora)).toThrow('tire as datas da parada');
  });

  it('nos outros tipos, opcionais (vazio grava nulo)', () => {
    expect(dadosDeFalha('PREVENTIVA', {}, agora)).toEqual({
      equipamento_parou: null,
      parada_inicio: null,
      parada_fim: null,
      falha_sintoma: null,
      falha_causa: null,
      falha_acao: null,
    });
  });

  it.each([
    [{ parada_inicio: parou.parada_inicio }, 'os dois'],
    [{ parada_fim: parou.parada_fim }, 'os dois'],
    [{ parada_inicio: parou.parada_fim, parada_fim: parou.parada_inicio }, 'antes de parar'],
    [{ parada_inicio: parou.parada_inicio, parada_fim: '2026-10-16T15:30:00.000Z' }, 'no futuro'],
    // O ano digitado errado (2025 no lugar de 2026): um ano de parada estragava o MTTR
    [{ parada_inicio: '2025-10-16T11:00:00.000Z', parada_fim: '2026-10-16T13:00:00.000Z' }, 'mais de um ano'],
  ])('a parada vai inteira e coerente: %j', (pedido, frase) => {
    expect(() => dadosDeFalha('PREVENTIVA', pedido, agora)).toThrow(frase);
  });

  it('parada informada é parou, também na preventiva (que não pergunta)', () => {
    expect(dadosDeFalha('PREVENTIVA', { parada_inicio: parou.parada_inicio, parada_fim: parou.parada_fim }, agora).equipamento_parou).toBe(true);
  });

  it('o relógio do celular uns minutos adiantado não trava', () => {
    expect(() => dadosDeFalha('PREVENTIVA', { parada_inicio: parou.parada_inicio, parada_fim: '2026-10-16T15:03:00.000Z' }, agora)).not.toThrow();
  });

  // A coluna é TIMESTAMP(0): arredondava os ms, e o retorno ia para antes da parada
  it('corta no segundo, para baixo (o banco arredondaria)', () => {
    const d = dadosDeFalha('PREVENTIVA', { parada_inicio: '2026-10-16T11:20:00.700Z', parada_fim: '2026-10-16T11:20:00.900Z' }, agora);
    expect([d.parada_inicio!.toISOString(), d.parada_fim!.toISOString()]).toEqual(['2026-10-16T11:20:00.000Z', '2026-10-16T11:20:00.000Z']);
  });

  it('minutos parados', () => {
    expect(minutosParado(dadosDeFalha('CORRETIVA', parou, agora))).toBe(105);
    expect(minutosParado({ parada_inicio: null, parada_fim: null })).toBeNull();
  });

  it('o que mudou, para o histórico', () => {
    const antes = dadosDeFalha('CORRETIVA', parou, agora);
    const depois = dadosDeFalha('CORRETIVA', { ...parou, parada_fim: '2026-10-16T11:50:00.000Z', falha_causa: 'Rolamento' }, agora);

    expect(mudancasNaFalha(antes, depois)).toBe(
      'Dados de falha alterados: voltou em: 2026-10-16T13:05:00.000Z -> 2026-10-16T11:50:00.000Z; causa: Ventilador travado por poeira -> Rolamento',
    );
    expect(mudancasNaFalha(antes, antes)).toBeNull();
    expect(mudancasNaFalha(antes, dadosDeFalha('CORRETIVA', { equipamento_parou: false, ...descricao }, agora))).toContain('parou: sim -> não');
  });
});

describe('dados de falha: a data vem com fuso (pipe do app)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
  const ler = (dados: Record<string, unknown>) => pipe.transform({ resultado_servico: 'ok', ...dados }, { type: 'body', metatype: ExecutarOSDto });

  it.each([
    ['2026-10-16T10:00'], // sem fuso: lido no fuso do servidor (3 h entre dev e produção)
    ['2026-02-30T10:00:00Z'], // virava 2 de março
    ['2026-W42-5'], // virava Invalid Date e dava 500
  ])('recusa %s com 400', async (data) => {
    await expect(ler({ parada_inicio: data })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([['2026-10-16T13:05:00.000Z'], ['2026-10-16T10:05:00-03:00']])('aceita %s', async (data) => {
    await expect(ler({ parada_inicio: data })).resolves.toBeDefined();
  });
});

describe('dados de falha ao executar a OS (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);
  const PREFIXO = 'TESTE-DADOS-FALHA';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const limpar = async () => {
    const ids = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    const osIds = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } })).map((o) => o.id);
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...ids, ...osIds].map((i) => i.trim()) } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    await limpar();
    planta = await criarPlantaDeTeste(prisma, 'dadosfalha', '95.000.000/0001-60');
  });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const osEmExecucao = async (tipo: 'CORRETIVA' | 'PREVENTIVA') => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} ${tipo}`,
      condicoes: 'PARADO',
      tipo,
      prioridade: 'ALTA',
      ...(await planta.origem()),
      planta_id: planta.id,
    } as never);
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);
    return os.id;
  };

  const ontem = (h: number) => new Date(Date.now() - 24 * 3_600_000 + h * 3_600_000).toISOString();

  it('a corretiva não executa sem os dados de falha', async () => {
    const osId = await osEmExecucao('CORRETIVA');

    await expect(execucoes.executar(osId, { resultado_servico: 'Inversor religado' } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } })).status).toBe('EM_EXECUCAO');
  });

  it('parou: grava a parada, e a resposta traz os minutos parados', async () => {
    const osId = await osEmExecucao('CORRETIVA');

    await execucoes.executar(osId, { resultado_servico: 'Inversor religado', ...parou, parada_inicio: ontem(0), parada_fim: ontem(2) } as never);

    expect(await execucoes.buscarPorId(osId)).toMatchObject({ status: 'EXECUTADA', falha_causa: descricao.falha_causa, minutos_parado: 120 });
  });

  it('parou sem horário: executa, e a OS diz que parou (sem duração)', async () => {
    const osId = await osEmExecucao('CORRETIVA');

    await execucoes.executar(osId, { resultado_servico: 'ok', equipamento_parou: true, ...descricao } as never);

    expect(await execucoes.buscarPorId(osId)).toMatchObject({ status: 'EXECUTADA', equipamento_parou: true, parada_inicio: null, minutos_parado: null });
  });

  // A trava do banco (2026-10-19-equipamento-parou.sql): parada só em quem parou
  it('o banco recusa parada em quem não parou', async () => {
    const osId = await osEmExecucao('PREVENTIVA');

    await expect(
      prisma.ordens_servico.update({
        where: { id: osId },
        data: { equipamento_parou: false, parada_inicio: new Date(ontem(0)), parada_fim: new Date(ontem(1)) },
      }),
    ).rejects.toThrow(/ordens_servico_parou_check/);
  });

  it('não parou: executa sem parada, com sintoma, causa e ação', async () => {
    const osId = await osEmExecucao('CORRETIVA');

    await execucoes.executar(osId, { resultado_servico: 'ok', equipamento_parou: false, ...descricao } as never);

    expect(await execucoes.buscarPorId(osId)).toMatchObject({
      status: 'EXECUTADA',
      equipamento_parou: false,
      minutos_parado: null,
      falha_sintoma: descricao.falha_sintoma,
    });
  });

  it('a preventiva executa sem eles; com a parada, grava a parada', async () => {
    const semParada = await osEmExecucao('PREVENTIVA');
    await execucoes.executar(semParada, { resultado_servico: 'ok' } as never);
    expect((await execucoes.buscarPorId(semParada)).minutos_parado).toBeNull();

    const comParada = await osEmExecucao('PREVENTIVA');
    await execucoes.executar(comParada, { resultado_servico: 'ok', parada_inicio: ontem(0), parada_fim: ontem(1) } as never);
    expect(await execucoes.buscarPorId(comParada)).toMatchObject({ minutos_parado: 60, equipamento_parou: true });
  });

  // Revisão do SN-60: o status era conferido fora da gravação, e o segundo
  // "Executar" (toque duplo) regravava calado os dados do primeiro
  it('dois "Executar" juntos: um passa, o outro é recusado', async () => {
    const osId = await osEmExecucao('PREVENTIVA');

    const [a, b] = await Promise.allSettled([
      execucoes.executar(osId, { resultado_servico: 'primeiro' } as never),
      execucoes.executar(osId, { resultado_servico: 'segundo' } as never),
    ]);

    expect([a.status, b.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
    const recusado = [a, b].find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(recusado.reason).toBeInstanceOf(ConflictException);
  });

  it('reexecutar depois de reabrir: o que mudou na falha vai para o histórico', async () => {
    const osId = await osEmExecucao('CORRETIVA');
    await execucoes.executar(osId, { resultado_servico: 'ok', ...parou, parada_inicio: ontem(0), parada_fim: ontem(2) } as never);
    await execucoes.auditar(osId, { avaliacao_qualidade: 3 } as never);
    await execucoes.reabrir(osId, {} as never);

    await execucoes.executar(osId, { resultado_servico: 'ok', ...parou, parada_inicio: ontem(0), parada_fim: ontem(1), falha_causa: 'Rolamento' } as never);

    const mudanca = await prisma.historico_os.findFirst({ where: { os_id: osId, acao: 'DADOS_DE_FALHA' } });
    expect(mudanca?.observacoes).toContain('causa: Ventilador travado por poeira -> Rolamento');
    expect(mudanca?.observacoes).toContain('voltou em:');
  });
});

describe('o equipamento da corretiva', () => {
  const prismaCom = (equipamentoDaAnomalia: string | null, dasTarefas: (string | null)[]) =>
    ({
      anomalias: { findUnique: jest.fn().mockResolvedValue(equipamentoDaAnomalia === undefined ? null : { equipamento_id: equipamentoDaAnomalia }) },
      tarefas_os: { findMany: jest.fn().mockResolvedValue(dasTarefas.map((e) => ({ equipamento_id: e }))) },
    }) as never;

  it('o da anomalia que originou a OS (aparado: Char(26))', async () => {
    expect(await equipamentoDaCorretiva(prismaCom('eqA                       ', []), 'os1', 'an1')).toBe('eqA');
  });

  it('sem anomalia, o das tarefas, se for um só', async () => {
    expect(await equipamentoDaCorretiva(prismaCom(null, ['eqB ', 'eqB']), 'os1', null)).toBe('eqB');
  });

  // Escolher um contaria a parada no equipamento errado
  it('com vários equipamentos nas tarefas, nenhum', async () => {
    expect(await equipamentoDaCorretiva(prismaCom(null, ['eqB', 'eqC']), 'os1', null)).toBeNull();
  });
});

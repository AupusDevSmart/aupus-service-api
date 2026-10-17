import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CondicaoOS, OrigemOS, PermissionScopeService, PrioridadeOS, PrismaService, TipoOS } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { horasDaEquipe, horasEmTexto, minutosEfetivos } from './horas-da-execucao';
import { ExecutarOSDto } from './dto/os-actions.dto';

/**
 * Horas-homem reais (SN-61). Ao executar, cada linha da equipe recebe as horas
 * trabalhadas (0 = não foi), quem entrou na hora também pode ser registrado, o
 * HH real é a soma e o custo real sai dessas horas. O tempo efetivo desconta
 * as pausas.
 */
const as = (hhmm: string, dia = '16') => new Date(`2026-10-${dia}T${hhmm}:00.000Z`);

describe('tempo efetivo (regra)', () => {
  it('sem pausa, do início ao fim', () => {
    expect(minutosEfetivos(as('08:00'), as('12:00'), [])).toBe(240);
  });

  it('desconta a pausa até a retomada', () => {
    const trilha = [
      { acao: 'PAUSA', data: as('09:00') },
      { acao: 'RETOMADA', data: as('09:30') },
    ];
    expect(minutosEfetivos(as('08:00'), as('12:00'), trilha)).toBe(210);
  });

  it('executar da OS pausada não conta o tempo parado', () => {
    expect(minutosEfetivos(as('08:00'), as('12:00'), [{ acao: 'PAUSA', data: as('11:00') }])).toBe(180);
  });

  it('executada e reaberta: o tempo entre a execução e a reabertura fica de fora', () => {
    const trilha = [
      { acao: 'INICIO_EXECUCAO', data: as('08:00') },
      { acao: 'EXECUCAO', data: as('12:00') },
      { acao: 'AUDITORIA', data: as('15:00') },
      { acao: 'REABERTURA', data: as('08:00', '17') },
    ];
    expect(minutosEfetivos(as('08:00'), as('09:00', '17'), trilha)).toBe(300);
  });

  it('a trilha em qualquer ordem (o detalhe da OS a traz da mais nova para a mais velha)', () => {
    const trilha = [
      { acao: 'RETOMADA', data: as('10:00') },
      { acao: 'PAUSA', data: as('09:00') },
    ];
    expect(minutosEfetivos(as('08:00'), as('12:00'), trilha)).toBe(180);
  });

  it('o início informado depois da pausa corta o intervalo', () => {
    const trilha = [
      { acao: 'PAUSA', data: as('07:00') },
      { acao: 'RETOMADA', data: as('08:30') },
    ];
    expect(minutosEfetivos(as('08:00'), as('12:00'), trilha)).toBe(210);
  });

  it('sem início ou sem fim, não há tempo; fim antes do início é zero', () => {
    expect(minutosEfetivos(null, as('12:00'), [])).toBeNull();
    expect(minutosEfetivos(as('08:00'), null, [])).toBeNull();
    expect(minutosEfetivos(as('12:00'), as('08:00'), [])).toBe(0);
  });

  it.each([
    [0, '0h'],
    [0.75, '45min'],
    [2.5, '2h30'],
    [3, '3h'],
    [3.33, '3h20'],
  ])('horas em texto: %s = %s', (horas, texto) => {
    expect(horasEmTexto(horas)).toBe(texto);
  });

  it('HH real é a soma do registrado; nulo enquanto ninguém registrou', () => {
    const d = (v: number | null) => (v === null ? null : new Prisma.Decimal(v));
    expect(horasDaEquipe([{ horas_estimadas: d(4)!, horas_trabalhadas: null }])).toEqual({ hh_real: null, hh_estimado: 4 });
    expect(
      horasDaEquipe([
        { horas_estimadas: d(4)!, horas_trabalhadas: d(3.5) },
        { horas_estimadas: d(4)!, horas_trabalhadas: d(0) },
        { horas_estimadas: d(0)!, horas_trabalhadas: d(2.25) },
      ]),
    ).toEqual({ hh_real: 5.75, hh_estimado: 8 });
  });
});

describe('horas no pedido (pipe do app)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
  const ler = (horas: unknown) =>
    pipe.transform({ resultado_servico: 'ok', horas_dos_tecnicos: [{ id: 'x', horas }] }, { type: 'body', metatype: ExecutarOSDto });

  it.each([[''], [-1], [1000], [2.555], [1e-7], [true]])('recusa %j com 400', async (horas) => {
    await expect(ler(horas)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([[0], [2.5], [999.99]])('aceita %j', async (horas) => {
    await expect(ler(horas)).resolves.toBeDefined();
  });
});

describe('horas ao executar a OS (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);

  const MODEL_TYPE = 'App\\Models\\User';
  const PREFIXO = 'TESTE-HORAS-OS';
  // 25 caracteres, como os ids cuid antigos: o Char(26) volta com espaço
  const ID = (s: string) => `testehoras${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const ANA = ID('ana');
  const BRUNO = ID('bruno');
  const PAULA = ID('paula');
  const PLANTA = ID('planta').padEnd(26, '0');
  const USUARIOS: [string, string, string][] = [
    [DONO, 'Dona da planta', 'proprietario'],
    [ANA, 'Ana Técnica', 'operador'],
    [BRUNO, 'Bruno de outra planta', 'operador'],
    [PAULA, 'Paula Planejadora', 'analista'],
  ];
  const IDS = USUARIOS.map(([id]) => id);

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    const oss = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs } }, select: { id: true } })).map((o) => o.id);
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...progs, ...oss].map((i) => i.trim()) } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
  };

  const apagarFixos = async () => {
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: { in: IDS } } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: IDS }, model_type: MODEL_TYPE } });
    await prisma.usuarios.deleteMany({ where: { id: { in: IDS } } });
  };

  beforeAll(async () => {
    await limpar();
    await apagarFixos();
    for (const [id, nome, role] of USUARIOS) {
      const papel = await prisma.roles.upsert({
        where: { name_guard_name: { name: role, guard_name: 'api' } },
        update: {},
        create: { name: role, guard_name: 'api' },
      });
      await prisma.usuarios.create({ data: { id, nome, email: `${id}@horas-os.teste`, role, status: 'Ativo' } });
      await prisma.model_has_roles.create({ data: { model_id: id, model_type: MODEL_TYPE, role_id: papel.id } });
    }
    await prisma.plantas.create({
      data: { id: PLANTA, nome: `${PREFIXO} planta`, cnpj: '96.000.000/0061-01', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    await prisma.planta_operadores.create({ data: { usuario_id: ANA, planta_id: PLANTA } });
  });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await apagarFixos();
    await prisma.$disconnect();
  });

  /** OS em execução com Ana (R$ 50/h) e uma linha de perfil sem pessoa. */
  const osEmExecucao = async (tecnicos: unknown[] = [
    { tecnico_id: ANA, especialidade: 'Técnico Elétrico', horas_estimadas: 4, custo_hora: 50 },
    { especialidade: 'Auxiliar', horas_estimadas: 4 },
  ]) => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} preventiva`,
      condicoes: CondicaoOS.FUNCIONANDO,
      tipo: TipoOS.PREVENTIVA,
      prioridade: PrioridadeOS.MEDIA,
      origem: OrigemOS.MANUAL,
      planta_id: PLANTA,
      tecnicos,
    } as never);
    await programacoes.aprovar(prog.id, {} as never);
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);
    const equipe = await prisma.tecnicos_os.findMany({ where: { os_id: os.id } });
    const linha = (especialidade: string) => equipe.find((t) => t.especialidade === especialidade)!.id;
    return { osId: os.id, ana: equipe.find((t) => t.tecnico_id?.trim() === ANA)?.id, auxiliar: equipe.find((t) => !t.tecnico_id)?.id, linha };
  };

  const executar = (osId: string, extra: Record<string, unknown>) => execucoes.executar(osId, { resultado_servico: 'ok', ...extra } as never);

  it('não executa sem as horas de toda a equipe; a mensagem diz de quem', async () => {
    const { osId, ana } = await osEmExecucao();

    await expect(executar(osId, {})).rejects.toThrow('Informe as horas trabalhadas de Ana Técnica, Auxiliar (sem pessoa) (0 se não trabalhou).');
    await expect(executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 3 }] })).rejects.toThrow('Auxiliar (sem pessoa)');
    expect((await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } })).status).toBe('EM_EXECUCAO');
  });

  it('grava as horas, quem foi, o custo; quem entrou na hora; HH real na resposta', async () => {
    const { osId, ana, auxiliar } = await osEmExecucao();

    await executar(osId, {
      horas_dos_tecnicos: [
        { id: ana, horas: 3.5 },
        { id: auxiliar, horas: 0 },
      ],
      tecnicos_extras: [{ tecnico_id: PAULA, horas: 2 }],
    });

    const equipe = await prisma.tecnicos_os.findMany({ where: { os_id: osId } });
    const de = (nome: string | null) => equipe.find((t) => t.nome === nome)!;
    expect(Number(de('Ana Técnica').horas_trabalhadas)).toBe(3.5);
    expect(de('Ana Técnica').presente).toBe(true);
    expect(Number(de('Ana Técnica').custo_total)).toBe(175);
    expect(Number(de(null).horas_trabalhadas)).toBe(0);
    expect(de(null).presente).toBe(false);
    // Quem entrou na hora: o nome do cadastro e o tipo de usuário como especialidade
    expect(de('Paula Planejadora')).toMatchObject({ especialidade: 'Planejador PCM', presente: true, custo_hora: null });
    expect(de('Paula Planejadora').tecnico_id?.trim()).toBe(PAULA);
    expect(Number(de('Paula Planejadora').horas_estimadas)).toBe(0);

    const os = await execucoes.buscarPorId(osId);
    expect(os).toMatchObject({ status: 'EXECUTADA', hh_real: 5.5, hh_estimado: 8, custo_real: 175 });
    expect(os.tempo_efetivo_minutos).toBeGreaterThanOrEqual(0);

    const trilha = await prisma.historico_os.findFirst({ where: { os_id: osId, acao: 'HORAS_TRABALHADAS' } });
    expect(trilha?.observacoes).toBe(
      'Horas trabalhadas (5h30 no total): Ana Técnica 3h30; Auxiliar (sem pessoa) 0h; Paula Planejadora 2h (entrou na execução).',
    );
  });

  it('o custo real sai das horas trabalhadas, não das estimadas', async () => {
    const { osId, ana, auxiliar } = await osEmExecucao();

    await executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 1 }, { id: auxiliar, horas: 1 }] });

    expect((await execucoes.buscarPorId(osId)).custo_real).toBe(50);
  });

  // Revisão de banco: em float, 0,5 h x R$ 2,01 dava 1,00 na linha e 1,01 no custo da OS
  it('custo da linha e custo real na mesma conta (Decimal, metade para cima)', async () => {
    const { osId, ana } = await osEmExecucao([{ tecnico_id: ANA, especialidade: 'Técnico Elétrico', horas_estimadas: 1, custo_hora: 2.01 }]);

    await executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 0.5 }] });

    expect(Number((await prisma.tecnicos_os.findUniqueOrThrow({ where: { id: ana } })).custo_total)).toBe(1.01);
    expect((await execucoes.buscarPorId(osId)).custo_real).toBe(1.01);
  });

  // Já existia: o executar gravava material e ferramenta de outra OS pelo id
  it('material ou ferramenta de outra OS no executar é 404 e não grava', async () => {
    const outra = await osEmExecucao([]);
    const { osId } = await osEmExecucao([]);
    const material = await prisma.materiais_os.create({ data: { os_id: outra.osId, descricao: 'Graxa', quantidade_planejada: 1, unidade: 'UN' } });
    const ferramenta = await prisma.ferramentas_os.create({ data: { os_id: outra.osId, descricao: 'Torquímetro', quantidade: 1 } });

    await expect(executar(osId, { materiais_consumidos: [{ id: material.id, quantidade_consumida: 9 }] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(executar(osId, { ferramentas_utilizadas: [{ id: ferramenta.id, condicao_depois: 'quebrada' }] })).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.materiais_os.findUniqueOrThrow({ where: { id: material.id } })).quantidade_consumida).toBeNull();
    expect((await prisma.ferramentas_os.findUniqueOrThrow({ where: { id: ferramenta.id } })).condicao_depois).toBeNull();
  });

  it('quem entrou na hora passa pela regra de quem pode ser escalado', async () => {
    const { osId, ana, auxiliar } = await osEmExecucao();
    const equipe = [{ id: ana, horas: 1 }, { id: auxiliar, horas: 1 }];

    // Fora da lista, a recusa não diz quem é nem por quê (revisão de segurança):
    // "X é cliente", "X está inativo" deixavam quem executa descobrir usuários pelo id
    for (const fora of [BRUNO, DONO, 'naoexisteninguem000000000', '   ']) {
      const recusa = executar(osId, { horas_dos_tecnicos: equipe, tecnicos_extras: [{ tecnico_id: fora, horas: 1 }] });
      await expect(recusa).rejects.toThrow('Uma das pessoas registradas não pode atuar nesta OS: escolha pela lista da tela.');
    }
    await expect(executar(osId, { horas_dos_tecnicos: equipe, tecnicos_extras: [{ tecnico_id: ANA, horas: 1 }] })).rejects.toThrow(
      'Ana Técnica já está na equipe',
    );
    await expect(executar(osId, { horas_dos_tecnicos: equipe, tecnicos_extras: [{ tecnico_id: PAULA, horas: 0 }] })).rejects.toThrow(
      'maiores que zero',
    );
    await expect(
      executar(osId, { horas_dos_tecnicos: equipe, tecnicos_extras: [{ tecnico_id: PAULA, horas: 1 }, { tecnico_id: `${PAULA} `, horas: 1 }] }),
    ).rejects.toThrow('duas vezes');
    expect(await prisma.tecnicos_os.count({ where: { os_id: osId } })).toBe(2);
  });

  it('linha de técnico de outra OS é 404; a mesma linha duas vezes, 400', async () => {
    const outra = await osEmExecucao();
    const { osId, ana, auxiliar } = await osEmExecucao();

    await expect(executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 1 }, { id: auxiliar, horas: 1 }, { id: outra.ana, horas: 1 }] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 1 }, { id: ana, horas: 2 }, { id: auxiliar, horas: 1 }] })).rejects.toThrow(
      'vieram duas vezes',
    );
  });

  it('OS sem equipe executa sem horas; HH real fica nulo', async () => {
    const { osId } = await osEmExecucao([]);

    await executar(osId, {});

    expect(await execucoes.buscarPorId(osId)).toMatchObject({ status: 'EXECUTADA', hh_real: null, hh_estimado: 0 });
  });

  it('o tempo efetivo desconta as pausas registradas', async () => {
    const { osId } = await osEmExecucao([]);
    const haHoras = (h: number) => new Date(Date.now() - h * 3_600_000);
    await prisma.ordens_servico.update({ where: { id: osId }, data: { data_hora_inicio_real: haHoras(3) } });
    await prisma.historico_os.createMany({
      data: [
        { os_id: osId, acao: 'PAUSA', usuario: 'Sistema', data: haHoras(2) },
        { os_id: osId, acao: 'RETOMADA', usuario: 'Sistema', data: haHoras(1) },
      ],
    });

    // Em execução, até agora (o painel do Executar parte daqui)
    expect((await execucoes.buscarPorId(osId)).tempo_efetivo_minutos).toBeGreaterThanOrEqual(119);
    await executar(osId, {});
    const tempo = (await execucoes.buscarPorId(osId)).tempo_efetivo_minutos!;
    expect(tempo).toBeGreaterThanOrEqual(119);
    expect(tempo).toBeLessThanOrEqual(121);

    // A listagem dá o mesmo número (coluna Tempo da tabela e exportação)
    const { data } = await execucoes.listar({ planta_id: PLANTA, limit: 50 } as never);
    expect(data.find((o) => o.id === osId)?.tempo_efetivo_minutos).toBe(tempo);
  });

  it('a listagem traz o HH real de cada OS', async () => {
    const { osId, ana, auxiliar } = await osEmExecucao();
    await executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 1.5 }, { id: auxiliar, horas: 2 }] });

    const { data } = await execucoes.listar({ planta_id: PLANTA, limit: 50 } as never);

    // SN-63: a planta vem na listagem (a exportação a lê de lá)
    expect(data.find((o) => o.id === osId)).toMatchObject({ hh_real: 3.5, hh_estimado: 8, planta: { nome: `${PREFIXO} planta` } });
  });

  it('reexecutar com as mesmas horas não repete a trilha; quem entrou na hora já é da equipe', async () => {
    const { osId, ana, auxiliar } = await osEmExecucao();
    await executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 2 }, { id: auxiliar, horas: 0 }], tecnicos_extras: [{ tecnico_id: PAULA, horas: 1 }] });
    await execucoes.auditar(osId, { avaliacao_qualidade: 4 } as never);
    await execucoes.reabrir(osId, {} as never);
    const paula = (await prisma.tecnicos_os.findFirstOrThrow({ where: { os_id: osId, nome: 'Paula Planejadora' } })).id;

    await expect(executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 2 }, { id: auxiliar, horas: 0 }] })).rejects.toThrow('Paula Planejadora');
    await executar(osId, { horas_dos_tecnicos: [{ id: ana, horas: 2 }, { id: auxiliar, horas: 0 }, { id: paula, horas: 1 }] });

    expect(await prisma.historico_os.count({ where: { os_id: osId, acao: 'HORAS_TRABALHADAS' } })).toBe(1);
    expect(await prisma.tecnicos_os.count({ where: { os_id: osId } })).toBe(3);
  });

  it('dois "Executar" juntos: quem entrou na hora é gravado uma vez só', async () => {
    const { osId, ana, auxiliar } = await osEmExecucao();
    const pedido = { horas_dos_tecnicos: [{ id: ana, horas: 1 }, { id: auxiliar, horas: 1 }], tecnicos_extras: [{ tecnico_id: PAULA, horas: 1 }] };

    const resultados = await Promise.allSettled([executar(osId, pedido), executar(osId, pedido)]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(await prisma.tecnicos_os.count({ where: { os_id: osId, nome: 'Paula Planejadora' } })).toBe(1);
  });

  it('quem pode entrar na execução: a equipe da planta da OS e o apoio, só id e nome', async () => {
    const { osId } = await osEmExecucao([]);

    const pessoas = await execucoes.pessoasQuePodemAtuar(osId);

    expect(pessoas.equipe.map((p) => p.id)).toContain(ANA);
    expect(pessoas.equipe.map((p) => p.id)).not.toContain(BRUNO);
    expect(pessoas.apoio.map((p) => p.id)).toContain(PAULA);
    // Quem executa é o menor papel interno: e-mail (o login) e papel do apoio não saem
    expect(Object.keys(pessoas.apoio.find((p) => p.id === PAULA)!).sort()).toEqual(['id', 'nome']);
  });

  it('a rota confere o escopo da OS de quem pede', async () => {
    const { osId } = await osEmExecucao([]);
    const outraPlanta = { id: 'x', plantas: [] } as never;
    (scope.assertEntityInScope as jest.Mock).mockRejectedValueOnce(new NotFoundException('Ordem de serviço não encontrada'));

    await expect(execucoes.pessoasQuePodemAtuar(osId, outraPlanta)).rejects.toBeInstanceOf(NotFoundException);
    expect(scope.assertEntityInScope).toHaveBeenCalledWith('ordem_servico', osId, outraPlanta);
  });
});

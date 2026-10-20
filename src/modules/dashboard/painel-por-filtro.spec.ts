import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { DashboardManutencaoService } from './dashboard-manutencao.service';
import { QueryDashboardManutencaoDto } from './dto/query-dashboard-manutencao.dto';
import { janelaDoPeriodo } from './recorte-do-painel';

/**
 * Os filtros do painel mudam os números (SN-79), contra Postgres real.
 *
 * O painel tinha regra própria: a instalação só pela coluna do equipamento (a
 * OS de tarefa, de anomalia e de componente sumia), a planta sem o UC pai, o
 * período cortando tudo pela criação (o backlog perdia a OS antiga aberta, e a
 * OS concluída no mês mas criada antes não contava) e os gráficos sempre em 12
 * meses. Os números saem por planta de teste: o aupus_test é compartilhado.
 */
describe('painel de manutenção pelos filtros (banco real)', () => {
  const prisma = new PrismaService();
  const painel = new DashboardManutencaoService(prisma, new PermissionScopeService(prisma));

  const ID = (s: string) => `testepainelfil${s}`.padEnd(25, '0').slice(0, 25);
  const UNIDADE_1 = ID('unidade1');
  const UNIDADE_2 = ID('unidade2');
  const UNIDADE_B = ID('unidadeb');
  const UC_1 = ID('uc1');
  const UAR_1 = ID('uar1');
  const UC_2 = ID('uc2');
  const UC_B = ID('ucb');
  const PREFIXO = 'TESTE-PAINEL-FILTRO';
  let a: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let b: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  const donoA = { id: 'donopainelfiltroa'.padEnd(26, '0').slice(0, 26), role: 'proprietario' };
  const donoB = { id: 'donopainelfiltrob'.padEnd(26, '0').slice(0, 26), role: 'proprietario' };

  const DIA_MS = 86_400_000;
  // Relativo a agora: o período do painel é "este mês", "este trimestre"...
  const haDias = (dias: number) => new Date(Date.now() - dias * DIA_MS);
  const agoraMesmo = () => new Date(Date.now() - 60_000);

  const apagar = async () => {
    const progs = await prisma.programacoes_os.findMany({ where: { codigo: { startsWith: PREFIXO } }, select: { id: true } });
    const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs.map((p) => p.id) } }, select: { id: true } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: oss.map((o) => o.id) } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss.map((o) => o.id) } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs.map((p) => p.id) } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: UAR_1 } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC_1, UC_2, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_1, UNIDADE_2, UNIDADE_B] } } });
  };

  let sequencia = 0;
  /** Uma OS na planta, com a programação dela (a OS exige uma) */
  const ordem = async (plantaId: string, dados: Record<string, unknown>) => {
    sequencia += 1;
    const programacao = await prisma.programacoes_os.create({
      data: {
        codigo: `${PREFIXO}-${sequencia}`, descricao: `${PREFIXO} ${sequencia}`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', origem: 'TAREFA',
        tempo_estimado: 1, duracao_estimada: 1, planta_id: plantaId, atualizado_em: new Date(),
      },
    });
    return (
      await prisma.ordens_servico.create({
        data: {
          programacao_id: programacao.id, numero_os: `${PREFIXO}-${sequencia}`, descricao: `OS ${sequencia}`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA',
          prioridade: 'MEDIA', origem: 'TAREFA', tempo_estimado: 3, duracao_estimada: 1, planta_id: plantaId, status: 'PENDENTE', atualizado_em: new Date(),
          criado_em: agoraMesmo(), data_hora_programada: agoraMesmo(), ...dados,
        },
      })
    ).id;
  };
  const concluida = (dias: number) => ({ status: 'FINALIZADA', criado_em: haDias(dias + 1), data_hora_programada: haDias(dias), data_hora_inicio_real: haDias(dias), data_hora_fim_real: haDias(dias) });

  beforeAll(async () => {
    // Antes das plantas: o que sobrou de uma execução interrompida as prende (FK)
    await apagar();
    a = await criarPlantaDeTeste(prisma, 'painelfiltroa', '74.100.000/0001-01');
    b = await criarPlantaDeTeste(prisma, 'painelfiltrob', '74.100.000/0001-02');
    const unidade = (id: string, plantaId: string) =>
      prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `${PREFIXO} ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    await unidade(UNIDADE_1, a.id);
    await unidade(UNIDADE_2, a.id);
    await unidade(UNIDADE_B, b.id);
    await prisma.equipamentos.create({ data: { id: UC_1, nome: 'Inversor 1', classificacao: 'UC', criticidade: '5', unidade_id: UNIDADE_1 } });
    await prisma.equipamentos.create({ data: { id: UAR_1, nome: 'Ventoinha 1', classificacao: 'UAR', criticidade: '2', equipamento_pai_id: UC_1 } });
    await prisma.equipamentos.create({ data: { id: UC_2, nome: 'Inversor 2', classificacao: 'UC', criticidade: '2', unidade_id: UNIDADE_2 } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '5', unidade_id: UNIDADE_B } });

    // Planta A — concluída hoje, pela tarefa no componente da instalação 1 (sem a coluna equipamento_id)
    const pelaTarefa = await ordem(a.id, { ...concluida(0), time_equipe: 'Equipe Alfa ', custo_real: 3000 });
    await prisma.tarefas_os.create({ data: { os_id: pelaTarefa, ordem: 1, status: 'CONCLUIDA', equipamento_id: UAR_1, nome_snapshot: 'x' } });
    // Concluída hoje, pela anomalia no UC da instalação 1 (criticidade 5)
    const anomalia = await prisma.anomalias.create({ data: { descricao: `${PREFIXO} vazamento`, local: 'x', ativo: 'x', origem: 'OPERADOR', planta_id: a.id, equipamento_id: UC_1 } });
    await ordem(a.id, { ...concluida(0), origem: 'ANOMALIA', tipo: 'CORRETIVA', anomalia_id: anomalia.id, custo_real: 1000 });
    // Anomalia de 40 dias, ainda aberta, cuja única OS foi cancelada: aberta AGORA e "sem OS"
    const antiga = await prisma.anomalias.create({
      data: { descricao: `${PREFIXO} antiga`, local: 'x', ativo: 'x', origem: 'OPERADOR', planta_id: a.id, equipamento_id: UC_1, created_at: haDias(40) },
    });
    await ordem(a.id, { status: 'CANCELADA', origem: 'ANOMALIA', anomalia_id: antiga.id, criado_em: haDias(39), data_hora_programada: haDias(39) });
    // Anomalia antiga do componente, sem a planta gravada: é da planta (e da instalação) do UC pai
    await prisma.anomalias.create({ data: { descricao: `${PREFIXO} componente`, local: 'x', ativo: 'x', origem: 'OPERADOR', equipamento_id: UAR_1 } });
    // Programada para agora e cancelada: não conta no plano do período
    await ordem(a.id, { status: 'CANCELADA' });
    // Concluída há 40 dias, no UC da instalação 2 (na coluna): no trimestre, fora do mês
    await ordem(a.id, { ...concluida(40), equipamento_id: UC_2 });
    // Concluída há 200 dias: só nos 12 meses
    await ordem(a.id, { ...concluida(200), equipamento_id: UC_2 });
    // Aberta, criada há 200 dias: o backlog é de agora, qualquer que seja o período
    await ordem(a.id, { status: 'PENDENTE', criado_em: haDias(200), data_hora_programada: haDias(199), equipamento_id: UC_2, tempo_estimado: 5 });

    // Planta B — uma concluída hoje, de outra equipe
    await ordem(b.id, { ...concluida(0), equipamento_id: UC_B, time_equipe: 'Equipe Beta' });
    // Concluída sem a data de fim (legado): vale a de início, não some
    await ordem(b.id, { status: 'FINALIZADA', equipamento_id: UC_B, data_hora_inicio_real: agoraMesmo(), data_hora_fim_real: null });
  });

  afterAll(async () => {
    await apagar();
    await a.apagar();
    await b.apagar();
    await prisma.$disconnect();
  });

  type Painel = Awaited<ReturnType<DashboardManutencaoService['getDashboard']>>;
  const kpi = (p: Painel, id: string) => p.kpis.find((k) => k.id === id)?.valor;
  const ler = (filtros: Partial<QueryDashboardManutencaoDto>, user?: { id: string; role: string }) => painel.getDashboard(filtros as QueryDashboardManutencaoDto, user);

  it('planta: só as OS dela', async () => {
    expect(kpi(await ler({ periodo: 'mes', plantaId: a.id }), 'os_concluida')).toBe('2');
    // A de B sem data de fim conta pela de início
    expect(kpi(await ler({ periodo: 'mes', plantaId: b.id }), 'os_concluida')).toBe('2');
  });

  it('instalação pela regra da OS: a da tarefa no componente e a da anomalia contam; a de outra instalação, não', async () => {
    expect(kpi(await ler({ periodo: '12meses', plantaId: a.id, unidadeId: UNIDADE_1 }), 'os_concluida')).toBe('2');
    expect(kpi(await ler({ periodo: '12meses', plantaId: a.id, unidadeId: UNIDADE_2 }), 'os_concluida')).toBe('2');
  });

  it('criticidade pelo equipamento da OS (tarefa, anomalia ou coluna)', async () => {
    // O UC 1 (5) pela anomalia; a ventoinha (2) pela tarefa, e o UC 2 (2) pela coluna
    expect(kpi(await ler({ periodo: '12meses', plantaId: a.id, criticidade: '5' }), 'os_concluida')).toBe('1');
    expect(kpi(await ler({ periodo: '12meses', plantaId: a.id, criticidade: '2' }), 'os_concluida')).toBe('3');
  });

  it('período: concluída pela data de fim; os gráficos acompanham o período', async () => {
    const mes = await ler({ periodo: 'mes', plantaId: a.id });
    const trimestre = await ler({ periodo: 'trimestre', plantaId: a.id });
    const ano12 = await ler({ periodo: '12meses', plantaId: a.id });
    expect([kpi(mes, 'os_concluida'), kpi(trimestre, 'os_concluida'), kpi(ano12, 'os_concluida')]).toEqual(['2', '3', '4']);
    expect([mes.meses.length, trimestre.meses.length, ano12.meses.length]).toEqual([1, 3, 12]);
    expect(mes.custo.total).toHaveLength(1);
  });

  it('o backlog é de agora: a OS aberta há 200 dias conta em qualquer período', async () => {
    for (const periodo of ['mes', 'trimestre', '12meses'] as const) {
      const p = await ler({ periodo, plantaId: a.id });
      expect([kpi(p, 'os_aberta'), kpi(p, 'backlog')]).toEqual(['1', '5']);
    }
  });

  it('equipe: o filtro conta só a dela, e o combo só traz as do escopo', async () => {
    expect(kpi(await ler({ periodo: 'mes', plantaId: a.id, equipe: 'Equipe Alfa' }), 'os_concluida')).toBe('1');
    const doDonoB = await ler({ periodo: 'mes' }, donoB);
    expect(doDonoB.opcoes.equipes).toEqual(['Equipe Beta']);
  });

  it('escopo: o dono de uma planta não vê a outra, nem pedindo por ela', async () => {
    expect(kpi(await ler({ periodo: 'mes', plantaId: a.id }, donoB), 'os_concluida')).toBe('0');
    expect(kpi(await ler({ periodo: 'mes' }, donoA), 'os_concluida')).toBe('2');
  });

  it('o DTO recusa período desconhecido (era aceito calado e virava 12 meses)', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    await expect(pipe.transform({ periodo: 'semana' }, { type: 'query', metatype: QueryDashboardManutencaoDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ criticidade: '9' }, { type: 'query', metatype: QueryDashboardManutencaoDto })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('o combo de instalações não traz as da planta fora do escopo (SN-57)', async () => {
    expect((await ler({ periodo: 'mes', plantaId: a.id }, donoB)).opcoes.unidades).toEqual([]);
    expect((await ler({ periodo: 'mes', plantaId: a.id }, donoA)).opcoes.unidades.map((u) => u.id).sort()).toEqual([UNIDADE_1, UNIDADE_2].sort());
  });

  it('anomalias abertas são de agora; a que só tem OS cancelada está "sem OS"; a do componente é da planta do pai', async () => {
    const anomalias = (await ler({ periodo: 'mes', plantaId: a.id })).kpis.find((k) => k.id === 'anomalias');
    expect([anomalias?.valor, anomalias?.nota]).toEqual(['3', '2 ainda sem OS']);
    expect(kpi(await ler({ periodo: 'mes', plantaId: a.id, unidadeId: UNIDADE_1 }), 'anomalias')).toBe('3');
    expect(kpi(await ler({ periodo: 'mes', plantaId: a.id, unidadeId: UNIDADE_2 }), 'anomalias')).toBe('0');
  });

  it('o plano do período não conta a OS cancelada', async () => {
    expect(kpi(await ler({ periodo: 'mes', plantaId: a.id }), 'os_planejada')).toBe('1');
  });

  it('ofensores pelo equipamento da OS (tarefa e anomalia; a coluna estava vazia)', async () => {
    expect((await ler({ periodo: 'mes', plantaId: a.id })).ofensores).toEqual([
      { ativo: 'Ventoinha 1', custoMil: 3 },
      { ativo: 'Inversor 1', custoMil: 1 },
    ]);
  });
});

/** O mês em Brasília (-03:00): o do servidor (UTC na produção) virava às 21h. */
describe('janelaDoPeriodo', () => {
  it('31/10 às 23h30 de Brasília (já 1º/11 em UTC) ainda é outubro', () => {
    const janela = janelaDoPeriodo('mes', new Date('2026-11-01T02:30:00Z'));
    expect(janela.meses.map((m) => m.rotulo)).toEqual(['out']);
    expect([janela.desde.toISOString(), janela.ate.toISOString()]).toEqual(['2026-10-01T03:00:00.000Z', '2026-11-01T03:00:00.000Z']);
  });

  it('o trimestre atravessa o ano; "ano" em janeiro é um mês', () => {
    expect(janelaDoPeriodo('trimestre', new Date('2027-01-15T12:00:00Z')).meses.map((m) => `${m.rotulo}/${m.ano}`)).toEqual(['nov/2026', 'dez/2026', 'jan/2027']);
    expect(janelaDoPeriodo('ano', new Date('2027-01-15T12:00:00Z')).meses).toHaveLength(1);
    expect(janelaDoPeriodo(undefined, new Date('2027-01-15T12:00:00Z')).meses).toHaveLength(12);
  });
});

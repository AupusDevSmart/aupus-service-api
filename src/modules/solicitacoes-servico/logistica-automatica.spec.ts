import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { exceptionFactoryEmPortugues } from '@/common/pipes/mensagens-validacao';
import { SolicitacoesServicoController } from './solicitacoes-servico.controller';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { CondicoesDaPropostaDto, PadroesDaPropostaDto, SalvarLogisticaDaPropostaDto } from './dto/proposta.dto';
import { PADROES_DA_SPEC, colunasDaLogistica, colunasDosPercentuais } from './padroes-da-proposta';
import { PADROES_DA_LOGISTICA } from './planejamento-da-proposta';

/**
 * A logística automática da proposta (30/out/2026), contra Postgres real: o
 * planejamento (km de ida, pessoas; dias e noites calculados quando vazios)
 * cria e acerta as linhas de km e de refeições; a ajustada à mão e a desligada
 * ficam como a pessoa deixou; o preço da linha é o padrão do dia em que nasceu.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: exceptionFactoryEmPortugues,
});
const corpo = <T>(metatype: new () => T, dados: unknown) => pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;
const PERCENTUAIS = { imposto_percentual: 15, margem_percentual: 20, adm_servicos_percentual: 5, adm_fd_percentual: 2 };

describe('padrões da logística (DTO)', () => {
  it('os padrões da logística são opcionais, sem negativo, com 1 a 50 pessoas por veículo', async () => {
    await expect(corpo(PadroesDaPropostaDto, PERCENTUAIS)).resolves.toBeDefined();
    await expect(corpo(PadroesDaPropostaDto, { ...PERCENTUAIS, valor_km: 2.5, pessoas_por_veiculo: 4, cafe_valor: 10 })).resolves.toMatchObject({ valor_km: 2.5 });
    await expect(corpo(PadroesDaPropostaDto, { ...PERCENTUAIS, valor_km: -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo(PadroesDaPropostaDto, { ...PERCENTUAIS, pessoas_por_veiculo: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo(PadroesDaPropostaDto, { ...PERCENTUAIS, horas_por_100_km: 25 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo(PadroesDaPropostaDto, { ...PERCENTUAIS, pessoas_padrao: 2.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a distância e o interno têm teto de verdade: o dobro e o km dos veículos cabem nas colunas', async () => {
    await expect(corpo(CondicoesDaPropostaDto, { distancia_km: 99_999.99, deslocamento_interno_km: 500 })).resolves.toBeDefined();
    await expect(corpo(CondicoesDaPropostaDto, { distancia_km: 100_000 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo(CondicoesDaPropostaDto, { deslocamento_interno_km: 100_000 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a linha automática leva uma chave conhecida', async () => {
    await expect(corpo(SalvarLogisticaDaPropostaDto, { linhas: [{ descricao: 'Almoço', quantidade: 2, valor_unitario: 20, automatica: 'ALMOCO', ajustada: true }] })).resolves.toBeDefined();
    await expect(corpo(SalvarLogisticaDaPropostaDto, { linhas: [{ descricao: 'Lanche', automatica: 'LANCHE' }] })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('logística automática (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const propostas = new PropostaService(prisma);
  const solicitacoes = new SolicitacoesServicoService(prisma, escopo, propostas);
  const controller = new SolicitacoesServicoController(solicitacoes, propostas);

  const ID = (s: string) => `testelogauto${s}`.padEnd(26, '0').slice(0, 26);
  const DONO = ID('dono');
  const PLANEJADOR = ID('planejador');
  const PLANTA = ID('planta');
  const PREFIXO = 'TESTE-LOGISTICA-AUTO';
  const comoPlanejador = { user: { id: PLANEJADOR, role: 'admin', permissions: ['solicitacoes.manage'] } } as never;
  const comoCliente = { user: { id: DONO, role: 'admin', permissions: ['solicitacoes.view'] } } as never;

  const apagar = async () => {
    await prisma.solicitacoes_servico.deleteMany({ where: { titulo: { startsWith: PREFIXO } } });
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, PLANEJADOR] } } });
  };
  const padroesDeFabrica = () => {
    const colunas = { ...colunasDosPercentuais(PADROES_DA_SPEC), ...colunasDaLogistica(PADROES_DA_LOGISTICA) };
    return prisma.padroes_da_proposta.upsert({ where: { id: 1 }, create: { id: 1, ...colunas }, update: colunas });
  };

  let instrucao = '';
  beforeAll(async () => {
    await apagar();
    await padroesDeFabrica();
    for (const id of [DONO, PLANEJADOR]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@logistica-auto.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: `${PREFIXO} planta`, cnpj: '97.220.000/0001-01', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    // Uma instrução sem preço (a conta é só a logística) e 9 h de passos
    const criada = await prisma.instrucoes.create({ data: { codigo: `${PREFIXO}-A`, nome: 'Termografia', descricao: 'x' } });
    instrucao = criada.id.trim();
    await prisma.sub_instrucoes.create({ data: { instrucao_id: instrucao, descricao: 'Medir', ordem: 1, duracao_horas: 9 } });
  });
  afterAll(async () => {
    await apagar();
    await padroesDeFabrica();
    await prisma.$disconnect();
  });

  let sequencia = 0;
  const novaSolicitacao = async () => {
    sequencia += 1;
    const criada = await solicitacoes.create(
      { titulo: `${PREFIXO} ${sequencia}`, descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA, instrucoes_ids: [instrucao] } as never,
      PLANEJADOR,
    );
    return criada.id.trim();
  };
  const condicoes = async (id: string, dados: Record<string, unknown>) => controller.salvarCondicoes(id, await corpo(CondicoesDaPropostaDto, dados), comoPlanejador);
  const logistica = async (id: string, tabela: string, linhas: unknown[]) =>
    controller.salvarLogistica(id, tabela, await corpo(SalvarLogisticaDaPropostaDto, { linhas }), comoPlanejador);
  type Lida = Awaited<ReturnType<PropostaService['obter']>>;
  const automaticas = (p: Lida) =>
    Object.fromEntries(
      (p.logistica as Array<Record<string, unknown>>)
        .filter((l) => l.automatica)
        .map((l) => [l.automatica, { quantidade: l.quantidade, km: l.km, valor: l.valor_unitario ?? l.valor_km, total: l.total, ajustada: l.ajustada, ativo: l.ativo }]),
    );
  /** A linha como a tela a manda de volta (sem id nem total) */
  const comoATela = (p: Lida, tabela: string): Array<Record<string, unknown>> =>
    (p.logistica as Array<Record<string, unknown>>)
      .filter((l) => l.tabela === tabela)
      .map(({ id: _id, tabela: _t, total: _total, ordem: _o, recurso_id, ...resto }) => ({ ...resto, recurso_id: recurso_id ?? null }));

  it('os padrões trazem a logística; salvar só os percentuais (a tela de antes) não a apaga', async () => {
    expect(await controller.obterPadroesDaProposta()).toEqual({ ...PERCENTUAIS, ...colunasDaLogistica(PADROES_DA_LOGISTICA) });
    await controller.salvarPadroesDaProposta(await corpo(PadroesDaPropostaDto, { ...PERCENTUAIS, almoco_valor: 25 }), comoPlanejador);
    await controller.salvarPadroesDaProposta(await corpo(PadroesDaPropostaDto, PERCENTUAIS), comoPlanejador);
    expect(await controller.obterPadroesDaProposta()).toMatchObject({ almoco_valor: 25, valor_km: 2.5, pessoas_por_veiculo: 4 });
    await padroesDeFabrica();
  });

  it('o km e as pessoas bastam: a ida e volta é o dobro, e o resto se calcula e vira linha', async () => {
    const id = await novaSolicitacao();
    const p = await condicoes(id, { distancia_km: 300, pessoas_previstas: 5 });
    expect(p).toMatchObject({ distancia_ida_volta_km: 600, dias_previstos: null, noites_fora: null });
    expect(p.planejamento_calculado).toEqual({
      horas_dos_passos: 9,
      horas_por_instrucao: [{ descricao: expect.stringContaining('Termografia'), horas: 9 }],
      pessoas: 5,
      ida_e_volta_km: 600,
      interno_km: 60,
      interno_sugerido_km: 60,
      horas_por_trecho: 4.5,
      bate_volta: false,
      dias_sugeridos: 3,
      dias: 3,
      noites_sugeridas: 2,
      noites: 2,
      veiculos: 2,
      km_por_veiculo: 660,
    });
    expect(automaticas(p)).toEqual({
      KM: { quantidade: 2, km: 660, valor: 2.5, total: 3300, ajustada: false, ativo: true },
      CAFE: { quantidade: 10, km: null, valor: 10, total: 100, ajustada: false, ativo: true },
      ALMOCO: { quantidade: 15, km: null, valor: 20, total: 300, ajustada: false, ativo: true },
      JANTAR: { quantidade: 10, km: null, valor: 20, total: 200, ajustada: false, ativo: true },
      PERNOITE: { quantidade: 10, km: null, valor: 100, total: 1000, ajustada: false, ativo: true },
    });
    // A conta já leva a logística: 4.900 de custo
    expect(p.fechamento?.custo_logistica).toBe(4900);
  });

  it('mudar o planejamento acompanha as quantidades; o preço da linha é o do dia em que nasceu', async () => {
    const id = await novaSolicitacao();
    await condicoes(id, { distancia_km: 300, pessoas_previstas: 5 });
    await prisma.padroes_da_proposta.update({ where: { id: 1 }, data: { almoco_valor: 30 } });
    const p = await condicoes(id, { pessoas_previstas: 3, dias_previstos: 2 });
    expect(automaticas(p)).toMatchObject({
      KM: { quantidade: 1 },
      ALMOCO: { quantidade: 6, valor: 20 },
      // Os dias digitados (2) mandam: uma noite
      CAFE: { quantidade: 3 },
      PERNOITE: { quantidade: 3 },
    });
    await padroesDeFabrica();
  });

  it('a ajustada à mão não acompanha até voltar ao automático; a que sai do planejamento fica zerada com o preço dela', async () => {
    const id = await novaSolicitacao();
    const inicial = await condicoes(id, { distancia_km: 300, pessoas_previstas: 2 });
    const diarias = comoATela(inicial, 'DIARIA').map((l) =>
      l.automatica === 'ALMOCO'
        ? { ...l, quantidade: 4, ajustada: true }
        : l.automatica === 'CAFE'
          ? { ...l, ativo: false }
          : l.automatica === 'PERNOITE'
            ? { ...l, valor_unitario: 180, descricao: 'Hotel da região' }
            : l,
    );
    await logistica(id, 'diaria', diarias);

    // Zero noites: jantar e pernoite ficam com zero (o pernoite com o preço e o nome acertados);
    // a equipe volta todo dia: 3 idas e voltas + o interno, por veículo
    const semNoites = await condicoes(id, { noites_fora: 0 });
    expect(automaticas(semNoites)).toMatchObject({
      ALMOCO: { quantidade: 4, ajustada: true },
      CAFE: { ativo: false },
      JANTAR: { quantidade: 0, total: 0 },
      PERNOITE: { quantidade: 0, valor: 180, total: 0 },
      KM: { km: 1860 },
    });
    expect(semNoites.fechamento?.custo_logistica).toBe(1860 * 2.5 + 80);
    // As noites voltam: o pernoite volta com o preço da proposta, não o padrão
    const comNoites = await condicoes(id, { noites_fora: 1 });
    expect(automaticas(comNoites).PERNOITE).toMatchObject({ quantidade: 2, valor: 180 });
    expect((comNoites.logistica as Array<{ automatica?: string | null; descricao: string }>).find((l) => l.automatica === 'PERNOITE')?.descricao).toBe('Hotel da região');

    // Voltar ao automático: o almoço é de novo pessoas × dias
    const deVolta = comoATela(comNoites, 'DIARIA').map((l) => (l.automatica === 'ALMOCO' ? { ...l, ajustada: false } : l));
    expect(automaticas(await logistica(id, 'diaria', deVolta))).toMatchObject({ ALMOCO: { quantidade: 6, ajustada: false } });
  });

  it('perto é bate-volta: só almoço e o km de todos os dias', async () => {
    const id = await novaSolicitacao();
    const p = await condicoes(id, { distancia_km: 100, pessoas_previstas: 2 });
    expect(p.planejamento_calculado).toMatchObject({ bate_volta: true, dias: 2, noites: 0, km_por_veiculo: 420 });
    expect(Object.keys(automaticas(p)).sort()).toEqual(['ALMOCO', 'KM']);
  });

  it('a linha automática fora da tabela dela ou repetida é 400, e nada muda', async () => {
    const id = await novaSolicitacao();
    await expect(logistica(id, 'deslocamento', [{ descricao: 'Almoço', automatica: 'ALMOCO' }])).rejects.toThrow(/fora da tabela/);
    await expect(
      logistica(id, 'diaria', [
        { descricao: 'Almoço', automatica: 'ALMOCO' },
        { descricao: 'Almoço 2', automatica: 'ALMOCO' },
      ]),
    ).rejects.toThrow(/repetida/);
  });

  it('sem pessoas digitadas valem as 2 do padrão', async () => {
    const id = await novaSolicitacao();
    const p = await condicoes(id, { distancia_km: 100 });
    expect(p.planejamento_calculado).toMatchObject({ pessoas: 2, veiculos: 1 });
    expect(automaticas(p).ALMOCO).toMatchObject({ quantidade: 4 });
  });

  it('a tela de antes do deploy (sem a chave) não grava por cima das automáticas: 409', async () => {
    const id = await novaSolicitacao();
    const p = await condicoes(id, { distancia_km: 300 });
    const semAChave = comoATela(p, 'DIARIA').map(({ automatica: _a, ajustada: _j, ...linha }) => linha);
    await expect(logistica(id, 'diaria', semAChave)).rejects.toBeInstanceOf(ConflictException);
  });

  it('a de antes com a logística digitada fica desligada até a pessoa ligar', async () => {
    const id = await novaSolicitacao();
    // Como a de antes do deploy: desligada, sem linha automática (o almoço que nasceu com ela sai)
    await prisma.solicitacoes_servico.update({ where: { id }, data: { logistica_automatica: false } });
    await prisma.solicitacoes_logistica.deleteMany({ where: { solicitacao_id: id } });
    const desligada = await condicoes(id, { distancia_km: 300, pessoas_previstas: 2 });
    expect(desligada.logistica_automatica).toBe(false);
    expect(Object.keys(automaticas(desligada))).toEqual([]);
    const ligada = await condicoes(id, { logistica_automatica: true });
    expect(Object.keys(automaticas(ligada)).sort()).toEqual(['ALMOCO', 'CAFE', 'JANTAR', 'KM', 'PERNOITE']);
  });

  it('revisar não fecha total que ninguém viu: com os padrões mudados, acerta, grava e pede para conferir; depois congela o planejamento', async () => {
    const id = await novaSolicitacao();
    await condicoes(id, { distancia_km: 300, pessoas_previstas: 5 });
    await prisma.padroes_da_proposta.update({ where: { id: 1 }, data: { pessoas_por_veiculo: 2 } });
    await expect(controller.revisarProposta(id, comoPlanejador)).rejects.toThrow(/logística automática mudou/);
    // Ficou gravado o acerto (3 veículos), ainda REGISTRADA
    const acertada = await propostas.obter(id);
    expect(automaticas(acertada).KM).toMatchObject({ quantidade: 3 });
    expect((await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id }, select: { status: true } })).status).toBe('REGISTRADA');
    // A segunda vez revisa, e o planejamento calculado vira o gravado
    await controller.revisarProposta(id, comoPlanejador);
    const revisada = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id }, select: { status: true, dias_previstos: true, noites_fora: true, pessoas_previstas: true, deslocamento_interno_km: true } });
    expect([revisada.status, Number(revisada.dias_previstos), revisada.noites_fora, revisada.pessoas_previstas, Number(revisada.deslocamento_interno_km)]).toEqual(['PROPOSTA_REVISADA', 3, 2, 5, 60]);
    await padroesDeFabrica();
  });

  it('o cliente não vê o planejamento calculado nem o interno', async () => {
    const id = await novaSolicitacao();
    await condicoes(id, { distancia_km: 300, pessoas_previstas: 2, deslocamento_interno_km: 15 });
    const doCliente = await controller.obterProposta(id, comoCliente);
    expect(doCliente).toMatchObject({ planejamento_calculado: null, deslocamento_interno_km: null, distancia_km: null, logistica_automatica: null, logistica: [] });
  });
});

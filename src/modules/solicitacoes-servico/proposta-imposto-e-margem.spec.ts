import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { exceptionFactoryEmPortugues } from '@/common/pipes/mensagens-validacao';
import { SolicitacoesServicoController } from './solicitacoes-servico.controller';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { InstrucoesService } from '../instrucoes/instrucoes.service';
import {
  CondicoesDaPropostaDto,
  NaoAprovadaDto,
  PadroesDaPropostaDto,
  SalvarItensDaPropostaDto,
  SalvarLogisticaDaPropostaDto,
  SalvarOutrosCustosDaPropostaDto,
} from './dto/proposta.dto';
import { PADROES_DA_SPEC, colunasDosPercentuais } from './padroes-da-proposta';

/**
 * A proposta por imposto e margem (29/out/2026), que substitui o BDI:
 * - informar o km, as instruções, as tabelas de frete, deslocamento e diárias e os
 *   custos adicionais; depois a administração, o imposto e a margem; o desconto antes
 *   do imposto, sobre o total inteiro;
 * - os percentuais padrão, que a solicitação nova copia;
 * - a revisão: só a proposta revisada se programa, e a programação herda dela;
 * - a proposta de antes (BDI) que volta à edição passa para a conta nova; a
 *   programada fica como documento.
 * Contra Postgres real.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: exceptionFactoryEmPortugues,
});
const corpo = <T>(metatype: new () => T, dados: unknown) => pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;
const recusa = (metatype: new () => unknown, dados: unknown) => expect(corpo(metatype, dados)).rejects.toBeInstanceOf(BadRequestException);

describe('corpo da proposta nova (DTO)', () => {
  it('os padrões levam os quatro percentuais, de 0 a 100, e nada além', async () => {
    const padroes = { imposto_percentual: 15, margem_percentual: 20, adm_servicos_percentual: 5, adm_fd_percentual: 2 };
    await expect(corpo(PadroesDaPropostaDto, padroes)).resolves.toMatchObject(padroes);
    const { margem_percentual: _sem, ...faltando } = padroes;
    await recusa(PadroesDaPropostaDto, faltando);
    await recusa(PadroesDaPropostaDto, { ...padroes, margem_percentual: 101 });
    await recusa(PadroesDaPropostaDto, { ...padroes, imposto_percentual: '' });
    await recusa(PadroesDaPropostaDto, { ...padroes, bdi_lucro: 5 });
  });

  it('a linha de logística: diga o que é; número negativo ou com casas demais é 400', async () => {
    await expect(corpo(SalvarLogisticaDaPropostaDto, { linhas: [{ descricao: 'Picape', dias: 2, valor_unitario: 180, km: 300, valor_km: 1.35 }] })).resolves.toBeDefined();
    await recusa(SalvarLogisticaDaPropostaDto, { linhas: [{ descricao: '   ', km: 10 }] });
    await recusa(SalvarLogisticaDaPropostaDto, { linhas: [{ descricao: 'Frete', km: -1 }] });
    await recusa(SalvarLogisticaDaPropostaDto, { linhas: [{ descricao: 'Frete', valor_km: 1.23456 }] });
    await recusa(SalvarLogisticaDaPropostaDto, { linhas: [{ descricao: 'Frete', total: 999 }] });
  });

  it('as condições: a validade é dia de calendário; o desconto, percentual ou valor', async () => {
    const lidas = await corpo(CondicoesDaPropostaDto, { validade_proposta: '2026-11-30', pessoas_previstas: 2, distancia_km: '' });
    expect(lidas.validade_proposta?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(lidas.distancia_km).toBeNull();
    await recusa(CondicoesDaPropostaDto, { validade_proposta: '2026-02-30' });
    await recusa(CondicoesDaPropostaDto, { pessoas_previstas: 2.5 });
    await recusa(CondicoesDaPropostaDto, { desconto_tipo: 'BRINDE', desconto_valor: 10 });
    await recusa(CondicoesDaPropostaDto, { bdi_regime: 'SEM_REIDI' });
  });

  it('não aprovada pede o motivo', async () => {
    await recusa(NaoAprovadaDto, {});
    await recusa(NaoAprovadaDto, { motivo: '   ' });
    await expect(corpo(NaoAprovadaDto, { motivo: 'Achou caro' })).resolves.toMatchObject({ motivo: 'Achou caro' });
  });
});

describe('proposta por imposto e margem (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const propostas = new PropostaService(prisma);
  const solicitacoes = new SolicitacoesServicoService(prisma, escopo, propostas);
  const controller = new SolicitacoesServicoController(solicitacoes, propostas);
  const programacoes = new ProgramacaoOSService(prisma, escopo);

  const ID = (s: string) => `testeimpostomargem${s}`.padEnd(26, '0').slice(0, 26);
  const DONO = ID('dono');
  const PLANEJADOR = ID('planejador');
  const OUTRO = ID('outro');
  const PLANTA = ID('planta');
  const PREFIXO = 'TESTE-IMPOSTO-MARGEM';
  const comoPlanejador = { user: { id: PLANEJADOR, role: 'admin', permissions: ['solicitacoes.manage', 'programacao_os.manage'] } } as never;
  const comoCliente = { user: { id: DONO, role: 'admin', permissions: ['solicitacoes.view'] } } as never;
  const comoOutro = { user: { id: OUTRO, role: 'admin', permissions: ['solicitacoes.view'] } } as never;

  const apagar = async () => {
    const minhas = await prisma.solicitacoes_servico.findMany({ where: { titulo: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = minhas.map((s) => s.id.trim());
    const progs = await prisma.programacoes_os.findMany({ where: { solicitacao_servico_id: { in: ids } }, select: { id: true } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...ids, ...progs.map((p) => p.id.trim())] } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs.map((p) => p.id) } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { id: { in: ids } } });
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, PLANEJADOR, OUTRO] } } });
  };
  const voltarAosDaSpec = () =>
    prisma.padroes_da_proposta.upsert({
      where: { id: 1 },
      create: { id: 1, ...colunasDosPercentuais(PADROES_DA_SPEC) },
      update: colunasDosPercentuais(PADROES_DA_SPEC),
    });

  let instrucao = '';
  beforeAll(async () => {
    await apagar();
    await voltarAosDaSpec();
    for (const id of [DONO, PLANEJADOR, OUTRO]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@imposto-margem.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: `${PREFIXO} planta`, cnpj: '97.220.000/0001-01', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    // A instrução de R$ 10.000 no catálogo (100 × R$ 100) e 3 h de passos
    const recurso = await prisma.recursos.create({ data: { nome: `${PREFIXO} Cabo`, categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'materiais', preco_unitario: 100 } });
    const criada = await prisma.instrucoes.create({ data: { codigo: `${PREFIXO}-A`, nome: 'Termografia', descricao: 'x' } });
    instrucao = criada.id.trim();
    await prisma.instrucao_recursos.create({ data: { instrucao_id: instrucao, recurso_id: recurso.id, quantidade: 100 } });
    await prisma.sub_instrucoes.create({ data: { instrucao_id: instrucao, descricao: 'Medir', ordem: 1, duracao_horas: 9 } });
  });
  afterAll(async () => {
    await apagar();
    await voltarAosDaSpec();
    await prisma.$disconnect();
  });

  let sequencia = 0;
  /** Uma solicitação da equipe, com a instrução vinculada e a proposta montada */
  const novaSolicitacao = async () => {
    sequencia += 1;
    const criada = await solicitacoes.create(
      { titulo: `${PREFIXO} ${sequencia}`, descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA, instrucoes_ids: [instrucao] } as never,
      PLANEJADOR,
    );
    return criada.id.trim();
  };
  /** A proposta do exemplo: a instrução de R$ 10.000 e um guindaste de R$ 5.000 que o cliente paga direto */
  const comProposta = async () => {
    const id = await novaSolicitacao();
    await controller.salvarOutrosCustos(id, await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Guindaste', valor: 5000, faturamento_direto: true }] }), comoPlanejador);
    return id;
  };
  const condicoes = async (id: string, dados: Record<string, unknown>) => controller.salvarCondicoes(id, await corpo(CondicoesDaPropostaDto, dados), comoPlanejador);
  const logistica = async (id: string, tabela: string, linhas: unknown[]) =>
    controller.salvarLogistica(id, tabela, await corpo(SalvarLogisticaDaPropostaDto, { linhas }), comoPlanejador);
  const gravada = (id: string) =>
    prisma.solicitacoes_servico.findUniqueOrThrow({
      where: { id },
      select: { status: true, conta_da_proposta: true, total_servicos: true, total_fd: true, total_administracao: true, total_aupus: true, valor_imposto: true, margem_efetiva: true, total_geral: true, total_desconto: true, bdi_percentual: true, imposto_percentual: true },
    });
  const emNumeros = async (id: string) => {
    const s = await gravada(id);
    const n = (v: unknown) => (v === null ? null : Number(v));
    return { total_servicos: n(s.total_servicos), total_fd: n(s.total_fd), total_administracao: n(s.total_administracao), total_aupus: n(s.total_aupus), valor_imposto: n(s.valor_imposto), total_geral: n(s.total_geral), total_desconto: n(s.total_desconto) };
  };

  it('a solicitação nova nasce com a conta nova e os padrões; trocar os padrões não mexe na que já existe', async () => {
    expect(await controller.obterPadroesDaProposta()).toEqual({ imposto_percentual: 15, margem_percentual: 20, adm_servicos_percentual: 5, adm_fd_percentual: 2 });
    const antiga = await novaSolicitacao();
    await controller.salvarPadroesDaProposta(await corpo(PadroesDaPropostaDto, { imposto_percentual: 12, margem_percentual: 25, adm_servicos_percentual: 4, adm_fd_percentual: 1 }), comoPlanejador);
    const nova = await novaSolicitacao();
    expect(Number((await gravada(nova)).imposto_percentual)).toBe(12);
    expect(Number((await gravada(antiga)).imposto_percentual)).toBe(15);
    await voltarAosDaSpec();
  });

  it('padrões com imposto e margem de 100% ou mais são 400 e nada muda', async () => {
    await expect(
      controller.salvarPadroesDaProposta(await corpo(PadroesDaPropostaDto, { imposto_percentual: 40, margem_percentual: 60, adm_servicos_percentual: 5, adm_fd_percentual: 2 }), comoPlanejador),
    ).rejects.toThrow(/100% ou mais/);
    expect(await controller.obterPadroesDaProposta()).toMatchObject({ imposto_percentual: 15, margem_percentual: 20 });
  });

  it('a conta gravada: serviços com imposto e margem, a administração só com o imposto, o FD no global', async () => {
    const id = await comProposta();
    expect(await emNumeros(id)).toEqual({
      total_servicos: 10000,
      total_fd: 5000,
      total_administracao: 705.88,
      total_aupus: 16090.5,
      valor_imposto: 2413.57,
      total_geral: 21090.5,
      total_desconto: null,
    });
    const proposta = await propostas.obter(id);
    expect(proposta.conta_da_proposta).toBe('IMPOSTO_MARGEM');
    expect(proposta.margem_efetiva).toBeCloseTo(22.852, 3);
    expect(proposta.itens.map((i) => i.valor_venda)).toEqual([15384.62]);
    expect(proposta.fechamento).toMatchObject({ custo_servicos: 10000, preco_servicos: 15384.62, preco_administracao: 705.88 });
    // 9 h de passos em jornadas de 8 h
    expect(proposta.dias_sugeridos).toBe(2);
  });

  it('frete, deslocamento e diárias: o total de cada linha pela tabela; a desativada fica fora da conta', async () => {
    const id = await comProposta();
    await logistica(id, 'deslocamento', [{ descricao: 'Picape', dias: 3, valor_unitario: 200, km: 240, valor_km: 2 }]);
    await logistica(id, 'diaria', [
      { descricao: 'Almoço', quantidade: 6, valor_unitario: 45 },
      { descricao: 'Pernoite', quantidade: 4, valor_unitario: 180, ativo: false },
    ]);
    const proposta = await propostas.obter(id);
    expect(proposta.logistica.map((l) => [l.tabela, l.descricao, l.total, l.ativo])).toEqual([
      ['DESLOCAMENTO', 'Picape', 1080, true],
      ['DIARIA', 'Almoço', 270, true],
      ['DIARIA', 'Pernoite', 720, false],
    ]);
    expect((await emNumeros(id)).total_servicos).toBe(11350);
    // Trocar uma tabela não mexe nas outras
    await logistica(id, 'diaria', []);
    expect((await emNumeros(id)).total_servicos).toBe(11080);
    await expect(logistica(id, 'pedagio', [])).rejects.toThrow(/frete, deslocamento ou diaria/);
  });

  it('o desconto é sobre o total inteiro, sai do faturamento da Aupus e não passa dele', async () => {
    const id = await comProposta();
    await condicoes(id, { desconto_tipo: 'PERCENTUAL', desconto_valor: 10 });
    expect(await emNumeros(id)).toMatchObject({ total_desconto: 2109.05, total_aupus: 13981.45, valor_imposto: 2097.22, total_geral: 18981.45 });

    await expect(condicoes(id, { desconto_tipo: 'VALOR', desconto_valor: 17000 })).rejects.toThrow(/faturamento da Aupus/);
    await condicoes(id, { desconto_tipo: null });
    expect(await emNumeros(id)).toMatchObject({ total_desconto: null, total_geral: 21090.5 });
  });

  it('a solicitação que a API antiga criou na janela do deploy (conta nova sem percentual) ganha os padrões; o digitado fica', async () => {
    const daJanela = await comProposta();
    await prisma.solicitacoes_servico.update({
      where: { id: daJanela },
      data: { imposto_percentual: null, margem_percentual: null, adm_servicos_percentual: null, adm_fd_percentual: null },
    });
    await condicoes(daJanela, { margem_percentual: 25 });
    const s = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: daJanela }, select: { imposto_percentual: true, margem_percentual: true } });
    expect([Number(s.imposto_percentual), Number(s.margem_percentual)]).toEqual([15, 25]);
  });

  it('imposto e margem da proposta com 100% ou mais são 400 e nada muda; o planejamento se grava e se apaga', async () => {
    const id = await comProposta();
    await expect(condicoes(id, { imposto_percentual: 50, margem_percentual: 50 })).rejects.toThrow(/100% ou mais/);
    expect(Number((await gravada(id)).imposto_percentual)).toBe(15);

    const proposta = await condicoes(id, { distancia_km: 150, distancia_ida_volta_km: 300, dias_previstos: 2, pessoas_previstas: 3, noites_fora: 1, validade_proposta: '2026-11-30', condicoes_comerciais: '  30 dias  ' });
    expect(proposta).toMatchObject({ distancia_km: 150, distancia_ida_volta_km: 300, dias_previstos: 2, pessoas_previstas: 3, noites_fora: 1, validade_proposta: '2026-11-30', condicoes_comerciais: '30 dias' });
    expect(await condicoes(id, { distancia_km: '', validade_proposta: '' })).toMatchObject({ distancia_km: null, validade_proposta: null, pessoas_previstas: 3 });
  });

  it('a proposta do BDI que volta à edição passa para a conta nova; a programada fica como documento', async () => {
    const registrada = await novaSolicitacao();
    const programada = await novaSolicitacao();
    const doBdi = { conta_da_proposta: 'BDI', imposto_percentual: null, bdi_percentual: 30.438, total_bdi: 3043.8, total_geral: 13043.8 };
    await prisma.solicitacoes_servico.updateMany({ where: { id: { in: [registrada, programada] } }, data: doBdi });
    await prisma.solicitacoes_servico.update({ where: { id: programada }, data: { status: 'PROGRAMADA' } });

    const documento = await propostas.obter(programada);
    expect(documento).toMatchObject({ conta_da_proposta: 'BDI', bdi_percentual: 30.438, total_bdi: 3043.8, total_geral: 13043.8, fechamento: null, venda: null });
    expect(documento.itens.map((i) => i.valor_venda)).toEqual([null]);
    await expect(controller.salvarOutrosCustos(programada, await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [] }), comoPlanejador)).rejects.toThrow(/depois de programada/);

    await controller.salvarOutrosCustos(registrada, await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [] }), comoPlanejador);
    const convertida = await gravada(registrada);
    expect([convertida.conta_da_proposta, Number(convertida.imposto_percentual), convertida.bdi_percentual]).toEqual(['IMPOSTO_MARGEM', 15, null]);
    // A troca de conta fica no histórico
    expect(await prisma.historico_solicitacao_servico.count({ where: { solicitacao_id: registrada, acao: 'PROPOSTA_CONVERTIDA' } })).toBe(1);
    // 15.384,62 dos serviços + a administração de 5% com o imposto (500 ÷ 0,85)
    expect(Number(convertida.total_geral)).toBe(15972.86);
  });

  it('revisar trava a proposta; reabrir a devolve; não aprovada guarda o motivo; cada um só do status certo', async () => {
    const id = await comProposta();
    const revisada = await controller.revisarProposta(id, comoPlanejador);
    expect(revisada.status).toBe('PROPOSTA_REVISADA');
    expect((await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id }, select: { aprovado_por_id: true } })).aprovado_por_id?.trim()).toBe(PLANEJADOR);
    await expect(controller.salvarItensDaProposta(id, await corpo(SalvarItensDaPropostaDto, { itens: [] }), comoPlanejador)).rejects.toThrow(/reabra-a/);
    await expect(solicitacoes.update(id, { titulo: `${PREFIXO} outro` } as never, PLANEJADOR)).rejects.toThrow(/registradas/);
    await expect(controller.revisarProposta(id, comoPlanejador)).rejects.toThrow(/já foi revisada/);

    const reaberta = await controller.reabrirProposta(id, { motivo: 'O cliente pediu outra data' }, comoPlanejador);
    expect(reaberta.status).toBe('REGISTRADA');
    expect((await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id }, select: { aprovado_por_id: true } })).aprovado_por_id).toBeNull();
    await expect(controller.reabrirProposta(id, {}, comoPlanejador)).rejects.toThrow(/ainda está em edição/);

    const recusada = await controller.propostaNaoAprovada(id, { motivo: '  Achou caro  ' }, comoPlanejador);
    expect(recusada.status).toBe('NAO_APROVADA');
    expect((await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id }, select: { motivo_rejeicao: true } })).motivo_rejeicao).toBe('Achou caro');
    await expect(controller.revisarProposta(id, comoPlanejador)).rejects.toThrow(/não aprovada: reabra-a/);

    const historico = await prisma.historico_solicitacao_servico.findMany({ where: { solicitacao_id: id }, orderBy: { data: 'asc' }, select: { acao: true, status_novo: true } });
    expect(historico.map((h) => h.acao)).toEqual(['CRIACAO', 'PROPOSTA_REVISADA', 'PROPOSTA_REABERTA', 'PROPOSTA_NAO_APROVADA']);
  });

  it('só a proposta revisada se programa, e a programação herda dela os valores, a logística e o veículo', async () => {
    const id = await comProposta();
    // O valor combinado da instrução (R$ 9.000), diferente do catálogo (R$ 10.000)
    const [item] = (await propostas.obter(id)).itens;
    await controller.salvarItensDaProposta(
      id,
      await corpo(SalvarItensDaPropostaDto, { itens: [{ descricao: item.descricao, quantidade: 1, preco_unitario: 9000, preco_unitario_original: 10000, instrucao_id: instrucao }] }),
      comoPlanejador,
    );
    await controller.salvarOutrosCustos(
      id,
      await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Guindaste', valor: 5000, faturamento_direto: true }, { descricao: 'ART', valor: 99.5 }] }),
      comoPlanejador,
    );
    await logistica(id, 'deslocamento', [{ descricao: 'Picape', dias: 3, valor_unitario: 200, km: 240, valor_km: 2 }]);
    await logistica(id, 'diaria', [{ descricao: 'Almoço', quantidade: 6, valor_unitario: 45 }, { descricao: 'Pernoite', quantidade: 2, valor_unitario: 200, ativo: false }]);
    await logistica(id, 'frete', [{ descricao: 'Frete do gerador', km: 100, quantidade: 2, valor_km: 3, valor_fixo: 50 }]);

    await expect(programacoes.criarDeSolicitacao(id, {}, PLANEJADOR)).rejects.toThrow(/não foi revisada/);
    await controller.revisarProposta(id, comoPlanejador);

    const heranca = await controller.paraProgramar(id, comoPlanejador);
    expect(heranca).toEqual({
      valores_das_instrucoes: [{ instrucao_id: instrucao, valor: 9000 }],
      itens_orcamento: [
        { descricao: 'Picape', valor: 1080, natureza: 'VEICULO' },
        { descricao: 'Almoço', valor: 270, natureza: 'DESPESA_CAMPO' },
        { descricao: 'Frete do gerador', valor: 650, natureza: 'TERCEIRO' },
        { descricao: 'ART', valor: 99.5, natureza: 'OUTRO' },
      ],
      necessita_veiculo: true,
      sem_vinculo: [],
      dias_previstos: null,
      pessoas_previstas: null,
    });

    const programacao = await programacoes.criarDeSolicitacao(id, {}, PLANEJADOR);
    const progId = programacao.id.trim();
    const [linhas, itens, prog] = await Promise.all([
      prisma.tarefas_programacao_os.findMany({ where: { programacao_id: progId }, select: { instrucao_id: true, valor: true, valor_original: true } }),
      prisma.itens_orcamento_programacao_os.findMany({ where: { programacao_id: progId }, select: { descricao: true, valor: true, natureza: true } }),
      prisma.programacoes_os.findUniqueOrThrow({ where: { id: progId }, select: { necessita_veiculo: true } }),
    ]);
    expect(linhas.map((l) => [l.instrucao_id?.trim(), Number(l.valor), Number(l.valor_original)])).toEqual([[instrucao, 9000, 10000]]);
    expect(itens.map((i) => [i.descricao, Number(i.valor), i.natureza]).sort()).toEqual(
      [['ART', 99.5, 'OUTRO'], ['Almoço', 270, 'DESPESA_CAMPO'], ['Frete do gerador', 650, 'TERCEIRO'], ['Picape', 1080, 'VEICULO']].sort(),
    );
    expect(prog.necessita_veiculo).toBe(true);
    expect((await gravada(id)).status).toBe('PROGRAMADA');

    // Com a programação aberta, a proposta não se revisa nem se recusa (seria uma segunda OS)
    await expect(controller.propostaNaoAprovada(id, { motivo: 'x' }, comoPlanejador)).rejects.toThrow(/programação|programada/);

    // Desprogramada, volta com a proposta já revisada
    await programacoes.cancelar(progId, { motivo_cancelamento: 'Cliente remarcou' }, PLANEJADOR);
    expect((await gravada(id)).status).toBe('PROPOSTA_REVISADA');

    // O orçamento que a tela manda soma o que vem da proposta (1.080 + 270 + 650 + 99,50)
    const pelaTela = await programacoes.criar(
      { descricao: `${PREFIXO} pela tela`, condicoes: 'FUNCIONANDO', tipo: 'INSPECAO', prioridade: 'MEDIA', origem: 'SOLICITACAO_SERVICO', solicitacao_servico_id: id, orcamento_previsto: 500 } as never,
      PLANEJADOR,
    );
    const { orcamento_previsto } = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: pelaTela.id.trim() }, select: { orcamento_previsto: true } });
    expect(Number(orcamento_previsto)).toBe(500 + 1080 + 270 + 650 + 99.5);
  });

  it('revisar recusa a proposta cujas instruções não batem com as vinculadas, e a da conta antiga', async () => {
    const id = await comProposta();
    // A linha de uma instrução que o formulário cancelado não vinculou
    const [item] = (await propostas.obter(id)).itens;
    await prisma.solicitacoes_instrucoes.deleteMany({ where: { solicitacao_id: id } });
    await expect(controller.revisarProposta(id, comoPlanejador)).rejects.toThrow(/não batem com as vinculadas/);
    expect((await gravada(id)).status).toBe('REGISTRADA');
    // A herança diz o que fica de fora, em vez de sumir com o valor
    expect((await controller.paraProgramar(id, comoPlanejador)).sem_vinculo).toEqual([item.descricao.trim()]);

    const doBdi = await novaSolicitacao();
    await prisma.solicitacoes_servico.update({ where: { id: doBdi }, data: { conta_da_proposta: 'BDI' } });
    await expect(controller.revisarProposta(doBdi, comoPlanejador)).rejects.toThrow(/conta antiga/);
  });

  it('a instrução não se vincula nem se desvincula da solicitação revisada pela tela da instrução', async () => {
    const id = await comProposta();
    await controller.revisarProposta(id, comoPlanejador);
    const instrucoes = new InstrucoesService(prisma, {} as never, escopo);
    const outra = await prisma.instrucoes.create({ data: { codigo: `${PREFIXO}-B`, nome: 'Outra', descricao: 'x' } });
    await expect(instrucoes.associarSolicitacao(outra.id.trim(), id)).rejects.toThrow(/reabra-a/);
    await expect(instrucoes.desassociarSolicitacao(instrucao, id)).rejects.toThrow(/reabra-a/);
  });

  it('o cliente dono lê os preços de venda e os totais, sem custo nem percentual; o outro não lê dinheiro', async () => {
    const id = await comProposta();
    await controller.salvarOutrosCustos(
      id,
      await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Guindaste', valor: 5000, faturamento_direto: true }, { descricao: 'ART', valor: 100 }] }),
      comoPlanejador,
    );
    await logistica(id, 'diaria', [{ descricao: 'Almoço', quantidade: 6, valor_unitario: 45 }]);

    const doCliente = await controller.obterProposta(id, comoCliente);
    expect(doCliente.itens[0]).toMatchObject({ preco_unitario: null, preco_unitario_original: null });
    expect(doCliente.itens[0].valor_venda).toBeGreaterThan(10000);
    expect(doCliente).toMatchObject({
      logistica: [],
      fechamento: null,
      imposto_percentual: null,
      margem_percentual: null,
      margem_efetiva: null,
      valor_imposto: null,
      total_custo: null,
      total_servicos: null,
      total_fd: 5000,
    });
    expect(doCliente.total_aupus).toBeGreaterThan(0);
    expect(doCliente.venda?.logistica).toBeGreaterThan(270);
    expect(doCliente.outros_custos.map((o) => [o.descricao, o.valor === null ? null : Number(o.valor)])).toEqual([['Guindaste', 5000], ['ART', null]]);

    const doOutro = await controller.obterProposta(id, comoOutro);
    expect(doOutro).toMatchObject({ total_aupus: null, total_geral: null, total_fd: null, venda: null, fechamento: null });
    expect(doOutro.itens[0]).toMatchObject({ valor_venda: null, preco_unitario: null });
    expect(doOutro.logistica[0]).toMatchObject({ descricao: 'Almoço', quantidade: 6, valor_unitario: null, total: null });

    // A lista e o detalhe da solicitação seguem a mesma régua
    const linha = await solicitacoes.findOne(id, (comoCliente as { user: never }).user);
    expect(linha).toMatchObject({ imposto_percentual: null, margem_efetiva: null, total_servicos: null });
    expect(Number((linha as unknown as { total_aupus: unknown }).total_aupus)).toBeGreaterThan(0);
  });
});

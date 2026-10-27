import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { acertarAvulsasDepoisDasTarefas } from '../programacao-os/instrucoes-da-programacao';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { codigoDoConteudo, conteudoDaOS } from './conteudo-da-os';

/**
 * O custo da OS por instrução e por natureza (SN-93), contra Postgres de verdade.
 *
 * Decisões do usuário (21/out/2026): cada instrução entra com o valor do
 * cadastro, ajustável só na programação (D1); os outros custos — veículo,
 * hospedagem, instrumentos — contam no custo real, conferidos no Executar, e o
 * não previsto se lança com descrição (D2); o custo real é o apurado (D4). Até
 * aqui o custo real era só mão de obra e material: na OSP-2026-0145, R$ 3.856,64
 * de veículo, hospedagem e alimentação ficavam de fora.
 *
 * Roda com `npx jest --runInBand src/modules/execucao-os/custos-da-os`.
 */
describe('custo da OS por instrução e por natureza (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);

  const PREFIXO = 'TESTE-CUSTOS-DA-OS';
  const CODIGO = 'TESTE-CUSTO-';
  const id = (nome: string) => `custosdaos${nome}`.padEnd(26, '0').slice(0, 26);
  const UNIDADE = id('unidade');
  const CATEGORIA = id('categoria');
  const POSICAO = id('posicao');
  const EQUIPAMENTO = id('equipamento');
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  const instrucoes = { A: '', B: '' };

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

  const apagarCadastro = async () => {
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: CODIGO } } });
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: CODIGO } } });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: EQUIPAMENTO } });
    await prisma.ativos_funcionais.deleteMany({ where: { id: POSICAO } });
    await prisma.categorias_equipamentos.deleteMany({ where: { id: CATEGORIA } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
  };

  beforeAll(async () => {
    await limpar();
    await apagarCadastro();
    planta = await criarPlantaDeTeste(prisma, 'custosdaos', '95.000.000/0001-93');
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: planta.id, nome: `${PREFIXO} usina`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.categorias_equipamentos.create({ data: { id: CATEGORIA, nome: `${PREFIXO} inversores` } });
    // O equipamento se apresenta pelo nome da posição: "Inversor 01", e não o do aparelho
    await prisma.ativos_funcionais.create({ data: { id: POSICAO, nome: 'Inversor 01', categoria_id: CATEGORIA, unidade_id: UNIDADE } });
    await prisma.equipamentos.create({
      data: { id: EQUIPAMENTO, nome: 'Growatt MAX 100KTL3', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE, ativo_funcional_id: POSICAO },
    });

    // A: 10 m de cabo a R$ 5 + 100 km de picape a R$ 2,35 = R$ 285,00; B: 2 m de cabo = R$ 10,00
    const cabo = await prisma.recursos.create({
      data: { nome: `${PREFIXO} Cabo`, categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'materiais', preco_unitario: 5 },
    });
    const picape = await prisma.recursos.create({
      data: { nome: `${PREFIXO} Picape`, categoria: 'VEICULO', base_calculo: 'km', rubrica: 'veiculos', preco_unitario: 2.35 },
    });
    const criar = async (letra: 'A' | 'B', linhas: { recurso_id: string; quantidade: number; distancia_km?: number }[]) => {
      const instrucao = await prisma.instrucoes.create({ data: { codigo: `${CODIGO}${letra}`, nome: `Termografia ${letra}`, descricao: 'x' } });
      for (const linha of linhas) await prisma.instrucao_recursos.create({ data: { instrucao_id: instrucao.id, ...linha } });
      instrucoes[letra] = instrucao.id.trim();
    };
    await criar('A', [{ recurso_id: cabo.id, quantidade: 10 }, { recurso_id: picape.id, quantidade: 1, distancia_km: 100 }]);
    await criar('B', [{ recurso_id: cabo.id, quantidade: 2 }]);
  });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await apagarCadastro();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const programar = async (extra: Record<string, unknown> = {}) =>
    programacoes.criar({
      descricao: `${PREFIXO} preventiva dos inversores`,
      condicoes: 'FUNCIONANDO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      ...(await planta.origem()),
      planta_id: planta.id,
      equipamento_id: EQUIPAMENTO,
      instrucoes_ids: [instrucoes.A, instrucoes.B],
      tecnicos: [{ especialidade: 'Eletricista', horas_estimadas: 8, custo_hora: 78 }],
      itens_orcamento: [
        // Sem natureza (a tela de antes): sai do prefixo
        { descricao: 'Veículo: Picape 4x4', valor: 1316 },
        { descricao: 'Hospedagem', valor: 1380, natureza: 'DESPESA_CAMPO' },
      ],
      ...extra,
    } as never);

  const linhas = (programacaoId: string) =>
    prisma.tarefas_programacao_os.findMany({ where: { programacao_id: programacaoId }, orderBy: { ordem: 'asc' } });
  const numero = (v: unknown) => (v === null ? null : Number(v));

  it('cada instrução entra com o valor do cadastro e o equipamento pelo nome da posição; o ajuste vale só ali e vai à trilha', async () => {
    const prog = await programar({ valores_das_instrucoes: [{ instrucao_id: instrucoes.B, valor: 120 }] });

    expect((await linhas(prog.id)).map((l) => [numero(l.valor), numero(l.valor_original), l.equipamento_nome])).toEqual([
      [285, 285, 'Inversor 01'],
      [120, 10, 'Inversor 01'],
    ]);
    expect(prog.instrucoes?.map((i) => [i.valor, i.valor_original, i.equipamento_nome])).toEqual([
      [285, 285, 'Inversor 01'],
      [120, 10, 'Inversor 01'],
    ]);
    const trilha = await prisma.historico_programacao_os.findFirstOrThrow({ where: { programacao_id: prog.id, acao: 'VALOR_DA_INSTRUCAO' } });
    expect(trilha.observacoes).toContain('de R$ 10,00 para R$ 120,00');
    // A natureza do item: a enviada, ou a do prefixo
    const itens = await prisma.itens_orcamento_programacao_os.findMany({ where: { programacao_id: prog.id }, orderBy: { valor: 'asc' } });
    expect(itens.map((i) => i.natureza)).toEqual(['VEICULO', 'DESPESA_CAMPO']);
  });

  it('na edição: null volta ao do cadastro; linha que não é da programação, ou sem dizer qual, é 400', async () => {
    const prog = await programar({ valores_das_instrucoes: [{ instrucao_id: instrucoes.B, valor: 120 }] });

    await programacoes.atualizar(prog.id, { valores_das_instrucoes: [{ instrucao_id: instrucoes.B, valor: null }] } as never);
    expect((await linhas(prog.id)).map((l) => numero(l.valor))).toEqual([285, 10]);

    await expect(
      programacoes.atualizar(prog.id, { valores_das_instrucoes: [{ instrucao_id: 'nao-esta-aqui', valor: 1 }] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      programacoes.atualizar(prog.id, { valores_das_instrucoes: [{ instrucao_id: instrucoes.A, tarefa_id: 'x', valor: 1 }] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** Programada, aprovada e iniciada; a instrução A feita */
  const emExecucao = async () => {
    const prog = await programar();
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);
    const [a, b] = await prisma.tarefas_os.findMany({ where: { os_id: os.id }, orderBy: { ordem: 'asc' } });
    await execucoes.concluirTarefa(os.id, a.id, {} as never);
    const [tecnico] = await prisma.tecnicos_os.findMany({ where: { os_id: os.id } });
    const itens = await prisma.itens_orcamento_os.findMany({ where: { os_id: os.id } });
    const veiculo = itens.find((i) => i.natureza === 'VEICULO')!;
    const hospedagem = itens.find((i) => i.natureza === 'DESPESA_CAMPO')!;
    return { osId: os.id, progId: prog.id, a, b, tecnico, veiculo, hospedagem };
  };

  const executar = (os: Awaited<ReturnType<typeof emExecucao>>, extra: Record<string, unknown> = {}) =>
    execucoes.executar(os.osId, {
      resultado_servico: 'Termografia feita',
      tarefas_nao_feitas: [{ id: os.b.id, motivo: 'O cliente não liberou o desligamento' }],
      horas_dos_tecnicos: [{ id: os.tecnico.id, horas: 7 }],
      ...extra,
    } as never);

  it('a OS leva das linhas da programação o valor, o equipamento e a natureza', async () => {
    const os = await emExecucao();
    expect([numero(os.a.valor), numero(os.a.valor_original), os.a.equipamento_nome]).toEqual([285, 285, 'Inversor 01']);
    expect([os.veiculo.valor_real, os.veiculo.nao_previsto]).toEqual([null, false]);
  });

  it('executar: o conferido e o não previsto entram no custo real; o não conferido, pelo previsto', async () => {
    const os = await emExecucao();
    await executar(os, {
      outros_custos: [
        { id: os.veiculo.id, valor_real: 1402.5 },
        { descricao: 'Pedágio', natureza: 'VEICULO', valor_real: 85 },
      ],
    });

    // 7 h × R$ 78 + R$ 1.402,50 de picape + R$ 85 de pedágio + R$ 1.380 de hospedagem (não conferida: o previsto)
    const gravada = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: os.osId } });
    expect(Number(gravada.custo_real)).toBe(3413.5);
    const pedagio = await prisma.itens_orcamento_os.findFirstOrThrow({ where: { os_id: os.osId, nao_previsto: true } });
    expect([pedagio.descricao, Number(pedagio.valor), Number(pedagio.valor_real), pedagio.natureza]).toEqual(['Pedágio', 0, 85, 'VEICULO']);
    const trilha = await prisma.historico_os.findFirstOrThrow({ where: { os_id: os.osId, acao: 'OUTROS_CUSTOS' } });
    expect(trilha.observacoes).toContain('previsto R$ 1.316,00, conferido R$ 1.402,50');

    const { custos } = await execucoes.buscarPorId(os.osId);
    expect(custos!.real).toBe(3413.5);
    expect(custos!.naturezas.map((n) => [n.natureza, n.previsto, n.real])).toEqual([
      ['MAO_DE_OBRA', 624, 546],
      ['MATERIAL', 0, 0],
      ['VEICULO', 1316, 1402.5],
      ['DESPESA_CAMPO', 1380, 1380],
      ['NAO_PREVISTO', 0, 85],
    ]);
    expect([custos!.instrucoes_feitas, custos!.instrucoes_feitas_total, custos!.instrucoes_total]).toEqual([1, 285, 295]);
    expect(custos!.instrucoes.map((i) => [i.equipamento, i.feita])).toEqual([
      ['Inversor 01', true],
      ['Inversor 01', false],
    ]);
    expect(custos!.pendencias).toContain('1 outro custo não foi conferido e entra pelo previsto.');
  });

  it('depois de executar: corrigir os outros custos refaz o custo real; o não previsto que não vem sai', async () => {
    const os = await emExecucao();
    await executar(os, { outros_custos: [{ id: os.veiculo.id, valor_real: 1402.5 }, { descricao: 'Pedágio', valor_real: 85 }] });

    await execucoes.registrarOutrosCustos(os.osId, {
      outros_custos: [
        { id: os.veiculo.id, valor_real: 1402.5 },
        { id: os.hospedagem.id, valor_real: 1200 },
      ],
    });

    const gravada = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: os.osId } });
    expect(Number(gravada.custo_real)).toBe(546 + 1402.5 + 1200);
    expect(await prisma.itens_orcamento_os.count({ where: { os_id: os.osId, nao_previsto: true } })).toBe(0);
    const trilhas = await prisma.historico_os.findMany({ where: { os_id: os.osId, acao: 'OUTROS_CUSTOS' }, orderBy: { data: 'asc' } });
    expect(trilhas[trilhas.length - 1].observacoes).toMatch(/Pedágio .*retirado.*Custo real de R\$ 3\.413,50 para R\$ 3\.148,50/);
  });

  it('o item de outra OS não existe aqui; o não previsto sem descrição é recusado; o mesmo item duas vezes também', async () => {
    const uma = await emExecucao();
    const outra = await emExecucao();
    await executar(uma);
    await expect(
      execucoes.registrarOutrosCustos(uma.osId, { outros_custos: [{ id: outra.veiculo.id, valor_real: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(execucoes.registrarOutrosCustos(uma.osId, { outros_custos: [{ valor_real: 10 }] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Revisão de banco: o mesmo id duas vezes gravava duas, e a trilha da segunda dizia "de" um valor errado
    await expect(
      execucoes.registrarOutrosCustos(uma.osId, {
        outros_custos: [
          { id: uma.veiculo.id, valor_real: 1 },
          { id: ` ${uma.veiculo.id}`, valor_real: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(Number((await prisma.itens_orcamento_os.findUniqueOrThrow({ where: { id: outra.veiculo.id } })).valor ?? 0)).toBe(1316);
  });

  // Revisão de falha silenciosa: corrigida com o Executar aberto, a lista dele sobrescrevia a correção
  it('a correção é depois do Executar; na auditada, só quem gerencia a OS', async () => {
    const os = await emExecucao();
    const pedido = { outros_custos: [{ id: os.veiculo.id, valor_real: 1402.5 }] };
    await expect(execucoes.registrarOutrosCustos(os.osId, pedido)).rejects.toBeInstanceOf(ConflictException);

    await executar(os);
    await execucoes.auditar(os.osId, { avaliacao_qualidade: 4 } as never);
    await expect(
      execucoes.registrarOutrosCustos(os.osId, pedido, 'tecnico', { id: 'tecnico', permissions: ['execucao_os.executar'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await execucoes.registrarOutrosCustos(os.osId, pedido, 'gerente', { id: 'gerente', permissions: ['execucao_os.manage'] });
    expect(Number((await prisma.itens_orcamento_os.findUniqueOrThrow({ where: { id: os.veiculo.id } })).valor_real)).toBe(1402.5);

    // Finalizada: selada, 409
    await execucoes.finalizar(os.osId, {} as never);
    await expect(execucoes.registrarOutrosCustos(os.osId, pedido)).rejects.toBeInstanceOf(ConflictException);
  });

  it('finalizar sela a versão 2 com o custo aberto, e o código confere', async () => {
    const os = await emExecucao();
    await executar(os, { outros_custos: [{ id: os.veiculo.id, valor_real: 1402.5 }, { id: os.hospedagem.id, valor_real: 1200 }] });
    await execucoes.auditar(os.osId, { avaliacao_qualidade: 4 } as never);
    await execucoes.finalizar(os.osId, {} as never);

    const gravada = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: os.osId } });
    const conteudo = gravada.conteudo_finalizado as unknown as Awaited<ReturnType<typeof conteudoDaOS>>;
    expect(conteudo.versao).toBe(2);
    expect(conteudo.outros_custos?.map((o) => [o.natureza, o.previsto, o.real])).toEqual([
      ['VEICULO', 1316, 1402.5],
      ['DESPESA_CAMPO', 1380, 1200],
    ]);
    expect(conteudo.tarefas.map((t) => [t.equipamento, t.valor])).toEqual([
      ['Inversor 01', 285],
      ['Inversor 01', 10],
    ]);
    expect((await execucoes.conferirCodigo(gravada.codigo_verificacao!)).confere).toBe(true);

    const relatorio = await execucoes.relatorio(os.osId);
    expect([relatorio.custos.real, relatorio.custos.instrucoes_feitas_total]).toEqual([3148.5, 285]);
    // D3: o PDF mostra o valor/hora de cada pessoa
    expect(relatorio.conteudo.equipe[0]).toMatchObject({ custo_hora: 78, horas_trabalhadas: 7 });

    // SERV-9: quem gerencia a OS (planejador para cima) recebe tudo; técnico de campo e cliente, nada de dinheiro
    const planejador = await execucoes.relatorio(os.osId, { id: 'p', role: 'analista', permissions: ['execucao_os.manage'] } as never);
    expect(planejador).toEqual(relatorio);
    const tecnico = await execucoes.relatorio(os.osId, { id: 't', role: 'analista', permissions: ['execucao_os.executar'] } as never);
    expect(tecnico.custos).toBeNull();
    expect(tecnico.conteudo).not.toHaveProperty('outros_custos');
    expect(tecnico.conteudo.os).toMatchObject({ custo_real: null });
    expect(tecnico.conteudo.os).not.toHaveProperty('orcamento_previsto');
    expect(tecnico.conteudo.os).not.toHaveProperty('custos_adicionais');
    expect(tecnico.conteudo.tarefas.some((t) => 'valor' in t || 'valor_original' in t)).toBe(false);
    expect(tecnico.conteudo.materiais.every((m) => m.custo_unitario === null)).toBe(true);
    // As horas ficam: são o registro da execução; o código é o da OS inteira
    expect(tecnico.conteudo.equipe[0]).toMatchObject({ custo_hora: null, horas_trabalhadas: 7 });
    expect(tecnico.codigo).toBe(relatorio.codigo);
    expect(tecnico.conteudo.tarefas.map((t) => t.equipamento)).toEqual(['Inversor 01', 'Inversor 01']);
  });

  it('o cliente não vê dinheiro da OS na tela; o técnico de campo e o planejador veem tudo (SERV-10)', async () => {
    const os = await emExecucao();
    await executar(os, { outros_custos: [{ id: os.veiculo.id, valor_real: 1402.5 }] });
    const cliente = { id: 'c', role: 'proprietario', permissions: ['execucao_os.view', 'programacao_os.view', 'dashboard.view'] } as never;
    const tecnico = { id: 't', role: 'operador', permissions: ['execucao_os.view', 'execucao_os.executar'] } as never;
    const planejador = { id: 'p', role: 'analista', permissions: ['execucao_os.manage', 'programacao_os.manage'] } as never;

    const completo = await execucoes.buscarPorId(os.osId);
    expect(completo.custos).not.toBeNull();
    expect(await execucoes.buscarPorId(os.osId, tecnico)).toEqual(completo);
    expect(await execucoes.buscarPorId(os.osId, planejador)).toEqual(completo);

    const doCliente = await execucoes.buscarPorId(os.osId, cliente);
    expect(doCliente.custos).toBeNull();
    expect(doCliente).toMatchObject({ custo_real: null, orcamento_previsto: null, custos_adicionais: null, itens_orcamento: [] });
    expect(doCliente.tarefas_os!.every((t) => t.valor === null && t.valor_original === null)).toBe(true);
    expect(doCliente.tecnicos.every((t) => t.custo_hora === null && t.custo_total === null)).toBe(true);
    expect(doCliente.materiais.every((m) => m.custo_unitario === null && m.custo_total === null)).toBe(true);
    // A programação que vem junto, e o R$ escrito na trilha
    expect(JSON.stringify(doCliente)).not.toMatch(/R\$\s*\d/);
    expect((doCliente.programacao as { orcamento_previsto?: unknown } | null)?.orcamento_previsto ?? null).toBeNull();
    // O resto da OS fica: as horas e as tarefas são o registro da execução
    expect(doCliente.tecnicos.map((t) => t.horas_trabalhadas)).toEqual(completo.tecnicos.map((t) => t.horas_trabalhadas));
    expect(doCliente.tarefas_os!.map((t) => t.equipamento_nome)).toEqual(completo.tarefas_os!.map((t) => t.equipamento_nome));

    const filtro = { search: completo.numero_os } as never;
    const [daLista] = (await execucoes.listar(filtro, cliente)).data;
    expect(daLista).toMatchObject({ numero_os: completo.numero_os, custo_real: null, orcamento_previsto: null });
    expect((await execucoes.listar(filtro, tecnico)).data[0].custo_real).toBe(completo.custo_real);

    const prog = await programacoes.buscarPorId(os.progId, cliente);
    expect(prog).toMatchObject({ orcamento_previsto: null, itens_orcamento: [] });
    expect(JSON.stringify(prog)).not.toMatch(/"valor(_original)?":\s*\d/);
    expect((await programacoes.buscarPorId(os.progId, planejador)).orcamento_previsto).toEqual((await programacoes.buscarPorId(os.progId)).orcamento_previsto);
  });

  // A OS finalizada antes do SN-93 tem o conteúdo da versão 1: o código dela tem de continuar conferindo
  it('a OS selada na versão 1 continua conferindo, e o PDF dela mostra os outros custos fora do total', async () => {
    const os = await emExecucao();
    await executar(os);
    await execucoes.auditar(os.osId, { avaliacao_qualidade: 4 } as never);
    await execucoes.finalizar(os.osId, {} as never);
    // O que a finalização de antes gravava: o custo real só de mão de obra e material, e o conteúdo da versão 1
    await prisma.ordens_servico.update({ where: { id: os.osId }, data: { custo_real: 546 } });
    const v1 = await conteudoDaOS(prisma, os.osId, undefined, 1);
    // Nada do SN-93 entra na versão 1: o texto dela é o de antes, e o código das finalizadas não muda
    expect(v1).not.toHaveProperty('outros_custos');
    expect(v1.os).not.toHaveProperty('orcamento_previsto');
    expect(v1.os).not.toHaveProperty('custos_adicionais');
    for (const chave of ['equipamento', 'valor', 'valor_original']) {
      expect(v1.tarefas.some((t) => chave in t)).toBe(false);
    }
    await prisma.ordens_servico.update({
      where: { id: os.osId },
      data: { codigo_verificacao: codigoDoConteudo(v1), conteudo_finalizado: v1 as never },
    });

    expect((await execucoes.conferirCodigo(codigoDoConteudo(v1))).confere).toBe(true);
    const relatorio = await execucoes.relatorio(os.osId);
    expect(relatorio.custos.real).toBe(546);
    // Fora do total, e não R$ 0 (que leria como economia); o previsto comparado é o de mão de obra e material
    expect(relatorio.custos.naturezas.find((n) => n.natureza === 'VEICULO')).toMatchObject({ previsto: 1316, real: null });
    expect([relatorio.custos.outros_fora_do_total, relatorio.custos.previsto]).toEqual([true, 624]);
    expect(relatorio.custos.pendencias.some((p) => p.includes('não tinha os outros custos'))).toBe(true);
    // O equipamento de cada tarefa vem do sistema na emissão (a versão 1 não o registrou)
    expect(relatorio.conteudo.tarefas.map((t) => t.equipamento)).toEqual(['Inversor 01', 'Inversor 01']);
    // E o sheet diz o mesmo que o PDF dela
    expect((await execucoes.buscarPorId(os.osId)).custos!.real).toBe(546);
  });
  // Revisões de banco e de falha silenciosa: tarefas_os.tarefa_id é Char(26) e o id da tarefa tem 25
  // caracteres; pelo include a linha não achava a instrução, e a OS selava sem o valor para sempre
  describe('a linha da tarefa (id de 25 caracteres) de antes do SN-93, sem valor', () => {
    let sequencia = 0;
    const novaTarefa = () => {
      sequencia += 1;
      return prisma.tarefas.create({
        data: { tag: `${CODIGO}T${sequencia}`, nome: 'Termografia do plano', criticidade: 3, ordem: 1, instrucao_id: instrucoes.A },
      });
    };
    const comLinhaDeTarefa = async (instrucao_tag?: string) => {
      const tarefa = await novaTarefa();
      expect(tarefa.id.trim()).toHaveLength(25);
      const prog = await programar({ instrucoes_ids: [instrucoes.B] });
      // Como o código de antes gravava: a linha da tarefa sem valor nem instrução
      await prisma.tarefas_programacao_os.create({
        data: {
          programacao_id: prog.id,
          origem_item: 'TAREFA',
          tarefa_id: tarefa.id,
          ordem: 0,
          nome_snapshot: 'Termografia do plano',
          equipamento_id: EQUIPAMENTO,
          instrucao_tag,
        },
      });
      return { prog, tarefa };
    };
    const linhaDaTarefa = (osId: string) => prisma.tarefas_os.findFirstOrThrow({ where: { os_id: osId, origem_item: 'TAREFA' } });

    it('a aprovação congela o valor do cadastro de agora, e a OS nasce com ele', async () => {
      const { prog } = await comLinhaDeTarefa();
      await programacoes.aprovar(prog.id, {});
      const daProgramacao = await prisma.tarefas_programacao_os.findFirstOrThrow({ where: { programacao_id: prog.id, origem_item: 'TAREFA' } });
      expect([numero(daProgramacao.valor), numero(daProgramacao.valor_original)]).toEqual([285, 285]);
      const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
      expect(numero((await linhaDaTarefa(os.id)).valor)).toBe(285);
    });

    it('a programação de antes mostra o do cadastro de hoje (e a instrução da tarefa), sem gravar', async () => {
      const { prog, tarefa } = await comLinhaDeTarefa();
      const detalhe = await programacoes.buscarPorId(prog.id);
      const daTarefa = detalhe.tarefas_programacao!.find((t) => t.tarefa_id?.trim() === tarefa.id.trim())!;
      // A tela mostrava os campos vazios e "Total das instruções: R$ 0,00"
      expect([daTarefa.valor, daTarefa.valor_original, daTarefa.do_cadastro_hoje]).toEqual([285, 285, true]);
      expect([daTarefa.tarefa?.id, daTarefa.tarefa?.instrucao_id, daTarefa.instrucao_id]).toEqual([tarefa.id.trim(), instrucoes.A, instrucoes.A]);
      // A avulsa, com o valor congelado na criação, não é tocada
      const avulsa = detalhe.instrucoes!.find((i) => i.instrucao_id === instrucoes.B)!;
      expect([avulsa.valor, avulsa.do_cadastro_hoje]).toEqual([10, false]);
      // Ler não grava: quem congela é a aprovação
      const gravada = await prisma.tarefas_programacao_os.findFirstOrThrow({ where: { programacao_id: prog.id, origem_item: 'TAREFA' } });
      expect([gravada.valor, gravada.valor_original]).toEqual([null, null]);
    });

    it('a tarefa que trocou de instrução depois do vínculo: vale a do código congelado na linha', async () => {
      const { prog, tarefa } = await comLinhaDeTarefa(`${CODIGO}A`);
      // O template trocou a instrução da tarefa, e a propagação leva a troca às cópias
      await prisma.tarefas.update({ where: { id: tarefa.id }, data: { instrucao_id: instrucoes.B } });
      const detalhe = await programacoes.buscarPorId(prog.id);
      const daTarefa = detalhe.tarefas_programacao!.find((t) => t.tarefa_id?.trim() === tarefa.id.trim())!;
      // O preço e o atalho são os da instrução que a linha pediu (o código e o checklist dela), não os da B
      expect([daTarefa.valor, daTarefa.instrucao_id]).toEqual([285, instrucoes.A]);
      await programacoes.aprovar(prog.id, {});
      const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
      expect(numero((await linhaDaTarefa(os.id)).valor)).toBe(285);
      const daOS = (await execucoes.buscarPorId(os.id)).tarefas_os!.find((t) => t.origem_item === 'TAREFA')!;
      expect(daOS.instrucao_id).toBe(instrucoes.A);
    });

    it('a OS de antes mostra o do cadastro de hoje (e o atalho para a instrução), e o finalizar congela', async () => {
      const { prog, tarefa } = await comLinhaDeTarefa();
      await programacoes.aprovar(prog.id, {});
      const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
      // A OS aprovada antes do deploy: a linha sem valor
      await prisma.tarefas_os.updateMany({ where: { os_id: os.id, origem_item: 'TAREFA' }, data: { valor: null, valor_original: null } });

      const detalhe = await execucoes.buscarPorId(os.id);
      const naResposta = detalhe.tarefas_os!.find((t) => t.origem_item === 'TAREFA')!;
      expect([naResposta.instrucao_id, naResposta.tarefa?.id?.trim()]).toEqual([instrucoes.A, tarefa.id.trim()]);
      const daTarefa = detalhe.custos!.instrucoes.find((i) => i.nome === 'Termografia do plano')!;
      expect([daTarefa.valor, daTarefa.do_cadastro_hoje]).toEqual([285, true]);
      expect(detalhe.custos!.pendencias.some((p) => p.includes('mostra o do cadastro de hoje'))).toBe(true);

      await execucoes.iniciar(os.id, {} as never);
      const [tecnico] = await prisma.tecnicos_os.findMany({ where: { os_id: os.id } });
      const pendentes = await prisma.tarefas_os.findMany({ where: { os_id: os.id } });
      await execucoes.executar(os.id, {
        resultado_servico: 'ok',
        horas_dos_tecnicos: [{ id: tecnico.id, horas: 1 }],
        tarefas_nao_feitas: pendentes.map((t) => ({ id: t.id, motivo: 'sem desligamento' })),
      } as never);
      await execucoes.auditar(os.id, { avaliacao_qualidade: 4 } as never);
      await execucoes.finalizar(os.id, {} as never);
      const congelada = await linhaDaTarefa(os.id);
      expect([numero(congelada.valor), numero(congelada.valor_original)]).toEqual([285, 285]);
    });

    it('ajustar a linha sem o do cadastro grava os dois: o ajuste aparece como ajuste', async () => {
      const { prog, tarefa } = await comLinhaDeTarefa();
      const resposta = await programacoes.atualizar(prog.id, { valores_das_instrucoes: [{ tarefa_id: tarefa.id.trim(), valor: 300 }] } as never);
      const linha = await prisma.tarefas_programacao_os.findFirstOrThrow({ where: { programacao_id: prog.id, origem_item: 'TAREFA' } });
      expect([numero(linha.valor), numero(linha.valor_original)]).toEqual([300, 285]);
      // A resposta do salvar (relida dentro da transação) já traz a tarefa e o ajuste
      const naResposta = resposta.tarefas_programacao!.find((t) => t.tarefa_id?.trim() === tarefa.id.trim())!;
      expect([naResposta.valor, naResposta.valor_original, naResposta.do_cadastro_hoje, naResposta.tarefa?.instrucao_id]).toEqual([300, 285, false, instrucoes.A]);
    });

    it('a avulsa ajustada que passa a vir por tarefa leva o valor para a linha da tarefa', async () => {
      const tarefa = await novaTarefa();
      const prog = await programar({ valores_das_instrucoes: [{ instrucao_id: instrucoes.A, valor: 200 }] });
      // A tarefa acrescentada depois, com o valor do cadastro
      await prisma.tarefas_programacao_os.create({
        data: { programacao_id: prog.id, origem_item: 'TAREFA', tarefa_id: tarefa.id, ordem: 0, valor: 285, valor_original: 285 },
      });
      await acertarAvulsasDepoisDasTarefas(prisma, prog.id, EQUIPAMENTO);
      const depois = await linhas(prog.id);
      expect(depois.some((l) => l.origem_item === 'INSTRUCAO' && l.instrucao_id?.trim() === instrucoes.A)).toBe(false);
      const daTarefa = depois.find((l) => l.origem_item === 'TAREFA')!;
      expect([numero(daTarefa.valor), numero(daTarefa.valor_original)]).toEqual([200, 285]);
    });
  });

  // Revisões de segurança e de banco: o status conferido só fora da transação
  it('dois "Aprovar" juntos: um passa, o outro é 409, e só uma OS nasce', async () => {
    const prog = await programar();
    const resultados = await Promise.allSettled([programacoes.aprovar(prog.id, {}), programacoes.aprovar(prog.id, {})]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const recusa = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected')!;
    expect(recusa.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.ordens_servico.count({ where: { programacao_id: prog.id } })).toBe(1);
  });
});

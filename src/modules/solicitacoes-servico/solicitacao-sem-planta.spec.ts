import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';

/**
 * A solicitação sem planta (28/out/2026). Muita solicitação não vira OS, e criar
 * usuário, planta e instalação para cada uma era trabalho jogado fora: a equipe
 * cadastra só com o cliente em texto, e a planta e a instalação se escolhem ao
 * programar — gravadas de volta na solicitação. Quem tem escopo por planta (o
 * cliente, o técnico) segue escolhendo a planta: sem ela, nem ele a veria.
 * Contra Postgres real.
 */
describe('solicitação sem planta (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const solicitacoes = new SolicitacoesServicoService(prisma, escopo, new PropostaService(prisma));
  const programacoes = new ProgramacaoOSService(prisma, escopo);

  const ID = (s: string) => `testesemplanta${s}`.padEnd(26, '0').slice(0, 26);
  const DONO = ID('dono');
  const PLANEJADOR = ID('planejador');
  const TECNICO = ID('tecnico');
  const PLANTA = ID('planta');
  const OUTRA_PLANTA = ID('outra');
  const UNIDADE = ID('unidade');
  const UNIDADE_DA_OUTRA = ID('unidadeoutra');
  const PREFIXO = 'TESTE-SEM-PLANTA';
  const cliente = { id: DONO, role: 'proprietario' };
  const tecnico = { id: TECNICO, role: 'operador' };

  const apagar = async () => {
    const minhas = await prisma.solicitacoes_servico.findMany({ where: { titulo: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = minhas.map((s) => s.id.trim());
    const progs = await prisma.programacoes_os.findMany({ where: { solicitacao_servico_id: { in: ids } }, select: { id: true } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...ids, ...progs.map((p) => p.id.trim())] } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs.map((p) => p.id) } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { id: { in: ids } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE, UNIDADE_DA_OUTRA] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA, OUTRA_PLANTA] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, PLANEJADOR, TECNICO] } } });
  };
  const planta = (id: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
  const unidade = (id: string, plantaId: string) =>
    prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `Unidade ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });

  beforeAll(async () => {
    await apagar();
    for (const id of [DONO, PLANEJADOR, TECNICO]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@sem-planta.teste` } });
    await planta(PLANTA, '96.110.000/0001-01');
    await planta(OUTRA_PLANTA, '96.110.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO, planta_id: PLANTA } });
    await unidade(UNIDADE, PLANTA);
    await unidade(UNIDADE_DA_OUTRA, OUTRA_PLANTA);
  });
  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  let sequencia = 0;
  const pedido = (campos: Record<string, unknown> = {}) => {
    sequencia += 1;
    return { titulo: `${PREFIXO} ${sequencia}`, descricao: 'Troca do disjuntor', tipo: 'OUTRO', ...campos } as never;
  };
  const lugar = (id: string) =>
    prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id }, select: { planta_id: true, unidade_id: true, proprietario_id: true, cliente_nome: true } });

  it('a equipe cadastra sem planta e sem instalação, com o cliente em texto', async () => {
    const criada = await solicitacoes.create(pedido({ cliente_nome: '  Padaria do Zé  ' }), PLANEJADOR);
    expect(await lugar(criada.id)).toEqual({ planta_id: null, unidade_id: null, proprietario_id: null, cliente_nome: 'Padaria do Zé' });
  });

  it('sem planta e sem cliente é 400: a solicitação tem de dizer de quem é', async () => {
    await expect(solicitacoes.create(pedido(), PLANEJADOR)).rejects.toThrow(/informe o nome do cliente/);
  });

  it('o cliente (escopo por planta) segue escolhendo a planta', async () => {
    await expect(solicitacoes.create(pedido({ cliente_nome: 'Eu' }), DONO, cliente)).rejects.toThrow(new BadRequestException('Escolha a planta da solicitação.'));
    await expect(solicitacoes.create(pedido({ planta_id: PLANTA }), DONO, cliente)).resolves.toMatchObject({ planta_id: PLANTA });
  });

  // Revisão de segurança (28/out/2026): pelo corpo do POST o técnico virava "dono" e lia a proposta
  it('quem não monta proposta não escolhe o dono nem o custo: o dono é o da planta, e a proposta é dele', async () => {
    const tecnicoComPermissoes = { ...tecnico, permissions: ['solicitacoes.view', 'solicitacoes.create', 'execucao_os.executar'] };
    const criada = await solicitacoes.create(
      pedido({ planta_id: PLANTA, proprietario_id: TECNICO, custo_estimado: 999 }),
      TECNICO,
      tecnicoComPermissoes as never,
    );
    const gravada = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: criada.id }, select: { proprietario_id: true, custo_estimado: true } });
    expect([gravada.proprietario_id?.trim(), gravada.custo_estimado]).toEqual([DONO, null]);
    expect(await solicitacoes.nivelDaPropostaPara(criada.id, tecnicoComPermissoes as never)).toBe('nenhuma');
    expect(await solicitacoes.nivelDaPropostaPara(criada.id, { ...cliente, permissions: ['solicitacoes.view'] } as never)).toBe('do_cliente');
    // Na lista e no detalhe, o dono (pela planta) lê os totais; o técnico, não
    await prisma.solicitacoes_servico.update({ where: { id: criada.id }, data: { total_geral: 1504.38, bdi_lucro: 5 } });
    type ComDinheiro = { total_geral?: unknown; bdi_lucro?: unknown };
    const doDono = (await solicitacoes.findOne(criada.id, { ...cliente, permissions: ['solicitacoes.view'] } as never)) as unknown as ComDinheiro;
    expect([Number(doDono.total_geral), doDono.bdi_lucro]).toEqual([1504.38, null]);
    const doTecnico = (await solicitacoes.findOne(criada.id, tecnicoComPermissoes as never)) as unknown as ComDinheiro;
    expect(doTecnico.total_geral).toBeNull();
  });

  it('o cliente em texto é da equipe: o de quem tem escopo não grava (nem no criar, nem no editar)', async () => {
    const criada = await solicitacoes.create(pedido({ planta_id: PLANTA, cliente_nome: 'Outra Empresa' }), DONO, cliente);
    expect(await lugar(criada.id)).toMatchObject({ cliente_nome: null });
    await prisma.solicitacoes_servico.update({ where: { id: criada.id }, data: { cliente_nome: 'Da equipe' } });
    await solicitacoes.update(criada.id, { cliente_nome: 'Trocado pelo cliente' } as never, DONO, cliente);
    expect(await lugar(criada.id)).toMatchObject({ cliente_nome: 'Da equipe' });
  });

  it('limpar só a instalação não leva a planta junto', async () => {
    const criada = await solicitacoes.create(pedido({ planta_id: PLANTA, unidade_id: UNIDADE, cliente_nome: 'Padaria' }), PLANEJADOR);
    await solicitacoes.update(criada.id, { unidade_id: null } as never, PLANEJADOR);
    expect(await lugar(criada.id)).toMatchObject({ planta_id: PLANTA, unidade_id: null });
  });

  it('o cliente não vê a solicitação sem planta (404, como a que não existe); a equipe vê', async () => {
    const criada = await solicitacoes.create(pedido({ cliente_nome: 'Padaria' }), PLANEJADOR);
    await expect(solicitacoes.findOne(criada.id, cliente)).rejects.toBeInstanceOf(NotFoundException);
    await expect(solicitacoes.findOne(criada.id)).resolves.toMatchObject({ cliente_nome: 'Padaria', planta: null });
  });

  it('a edição tira e põe a planta; sem planta, o cliente em texto é exigido', async () => {
    const criada = await solicitacoes.create(pedido({ planta_id: PLANTA, unidade_id: UNIDADE }), PLANEJADOR);
    await expect(solicitacoes.update(criada.id, { planta_id: null, unidade_id: null } as never, PLANEJADOR)).rejects.toThrow(/informe o nome do cliente/);

    await solicitacoes.update(criada.id, { planta_id: null, unidade_id: null, cliente_nome: 'Mercado Central' } as never, PLANEJADOR);
    expect(await lugar(criada.id)).toMatchObject({ planta_id: null, unidade_id: null, cliente_nome: 'Mercado Central' });

    await solicitacoes.update(criada.id, { planta_id: PLANTA, unidade_id: UNIDADE } as never, PLANEJADOR);
    expect(await lugar(criada.id)).toMatchObject({ planta_id: PLANTA, unidade_id: UNIDADE });
  });

  const programar = (solicitacaoId: string, campos: Record<string, unknown> = {}) =>
    programacoes.criar(
      { descricao: `${PREFIXO} programação`, condicoes: 'FUNCIONANDO', tipo: 'CORRETIVA', prioridade: 'MEDIA', origem: 'SOLICITACAO_SERVICO', solicitacao_servico_id: solicitacaoId, ...campos } as never,
      PLANEJADOR,
    );

  it('programar sem escolher a planta é 400; escolhendo, a solicitação recebe a planta e a instalação', async () => {
    const criada = await solicitacoes.create(pedido({ cliente_nome: 'Padaria' }), PLANEJADOR);
    await expect(programar(criada.id)).rejects.toThrow(/Toda programação precisa de planta/);

    const programacao = await programar(criada.id, { planta_id: PLANTA, unidade_id: UNIDADE });
    expect(programacao).toMatchObject({ planta_id: PLANTA });
    // O dono vem da planta: o cliente passa a enxergar a solicitação
    expect(await lugar(criada.id)).toMatchObject({ planta_id: PLANTA, unidade_id: UNIDADE, proprietario_id: DONO, cliente_nome: 'Padaria' });
    await expect(solicitacoes.findOne(criada.id, cliente)).resolves.toBeDefined();
  });

  it('a instalação de outra planta é 400 e nada fica (nem a programação)', async () => {
    const criada = await solicitacoes.create(pedido({ cliente_nome: 'Padaria' }), PLANEJADOR);
    await expect(programar(criada.id, { planta_id: PLANTA, unidade_id: UNIDADE_DA_OUTRA })).rejects.toThrow(
      'A instalação escolhida não é da planta da programação.',
    );
    expect(await lugar(criada.id)).toMatchObject({ planta_id: null, unidade_id: null });
    expect(await prisma.programacoes_os.count({ where: { solicitacao_servico_id: criada.id } })).toBe(0);
  });

  it('a solicitação que já tem planta não é mexida, e outra planta na programação é 400', async () => {
    const criada = await solicitacoes.create(pedido({ planta_id: PLANTA, unidade_id: UNIDADE }), PLANEJADOR);
    await expect(programar(criada.id, { planta_id: OUTRA_PLANTA })).rejects.toThrow(/não é a mesma/);
    await programar(criada.id, { unidade_id: UNIDADE_DA_OUTRA });
    expect(await lugar(criada.id)).toMatchObject({ planta_id: PLANTA, unidade_id: UNIDADE });
  });

  it('quem tem escopo não programa a solicitação sem planta de outro (404): não a adota pela planta dele', async () => {
    const criada = await solicitacoes.create(pedido({ cliente_nome: 'Padaria' }), PLANEJADOR);
    await expect(
      programacoes.criar(
        { descricao: `${PREFIXO} programação`, condicoes: 'FUNCIONANDO', tipo: 'CORRETIVA', prioridade: 'MEDIA', origem: 'SOLICITACAO_SERVICO', solicitacao_servico_id: criada.id, planta_id: PLANTA } as never,
        TECNICO,
        tecnico,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await lugar(criada.id)).toMatchObject({ planta_id: null });
  });

  it('a planta excluída não é adotada (404)', async () => {
    const criada = await solicitacoes.create(pedido({ cliente_nome: 'Padaria' }), PLANEJADOR);
    await prisma.plantas.update({ where: { id: OUTRA_PLANTA }, data: { deleted_at: new Date() } });
    try {
      await expect(programar(criada.id, { planta_id: OUTRA_PLANTA })).rejects.toThrow('Planta não encontrada');
    } finally {
      await prisma.plantas.update({ where: { id: OUTRA_PLANTA }, data: { deleted_at: null } });
    }
    expect(await lugar(criada.id)).toMatchObject({ planta_id: null });
  });

  it('a edição da programação que troca a origem para uma solicitação sem planta grava a planta nela', async () => {
    const comPlanta = await solicitacoes.create(pedido({ planta_id: PLANTA, unidade_id: UNIDADE }), PLANEJADOR);
    const semPlanta = await solicitacoes.create(pedido({ cliente_nome: 'Mercado' }), PLANEJADOR);
    const programacao = await programar(comPlanta.id);
    await programacoes.atualizar(programacao.id, { solicitacao_servico_id: semPlanta.id, unidade_id: UNIDADE } as never, PLANEJADOR);
    expect(await lugar(semPlanta.id)).toMatchObject({ planta_id: PLANTA, unidade_id: UNIDADE, proprietario_id: DONO });
  });

  it('a rota de programar a partir da solicitação também recebe a planta e a instalação', async () => {
    const criada = await solicitacoes.create(pedido({ cliente_nome: 'Padaria' }), PLANEJADOR);
    await programacoes.criarDeSolicitacao(criada.id, { planta_id: PLANTA, unidade_id: UNIDADE } as never, PLANEJADOR);
    expect(await lugar(criada.id)).toMatchObject({ planta_id: PLANTA, unidade_id: UNIDADE });
  });
});

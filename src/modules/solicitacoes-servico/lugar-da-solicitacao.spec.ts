import { NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { comOLugarAparado, mudouOLugar } from './lugar-da-solicitacao';

/**
 * O lugar da solicitação (revisão do SN-57). Para quem tem escopo, a planta, a
 * unidade ou o equipamento de outra planta respondem como o que não existe — a
 * ordem era a inversa, e o texto contava que o id existe. A unidade e o
 * equipamento têm de ser da planta (com as duas, a unidade de outra planta
 * passava), e a edição confere o lugar novo (antes não conferia nada). Contra
 * Postgres real.
 */
describe('o lugar da solicitação (banco real)', () => {
  const prisma = new PrismaService();
  const solicitacoes = new SolicitacoesServicoService(prisma, new PermissionScopeService(prisma), new PropostaService(prisma));

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testelugarsol${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UNIDADE_B = ID('unidadeb');
  const UC_A = ID('uca');
  const UC_B = ID('ucb');
  const tecnicoB = { id: TECNICO_B, role: 'operador' };

  const apagar = async () => {
    await prisma.solicitacoes_servico.deleteMany({ where: { planta_id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC_A, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, TECNICO_B] } } });
  };

  const planta = (id: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `Planta ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
  const unidade = (id: string, plantaId: string) =>
    prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `Unidade ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });

  beforeAll(async () => {
    await apagar();
    for (const id of [DONO, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@lugar-sol.teste` } });
    await planta(PLANTA_A, '97.000.000/0001-01');
    await planta(PLANTA_B, '97.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });
  });
  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const pedido = (lugar: Record<string, unknown>) =>
    ({ titulo: 'Serviço', descricao: 'Troca do disjuntor', tipo: 'OUTRO', local: 'Casa de força', ...lugar }) as never;

  const mensagem = (promessa: Promise<unknown>) => promessa.then(() => 'passou', (e: Error) => `${e.constructor.name}: ${e.message}`);

  it('para o técnico, a planta e a unidade de fora respondem como as que não existem', async () => {
    expect(await mensagem(solicitacoes.create(pedido({ planta_id: PLANTA_A }), TECNICO_B, tecnicoB))).toBe(
      `NotFoundException: Planta com ID ${PLANTA_A} não encontrada ou foi deletada`,
    );
    expect(await mensagem(solicitacoes.create(pedido({ planta_id: ID('naoexiste') }), TECNICO_B, tecnicoB))).toBe(
      `NotFoundException: Planta com ID ${ID('naoexiste')} não encontrada ou foi deletada`,
    );
    expect(await mensagem(solicitacoes.create(pedido({ unidade_id: UNIDADE_A }), TECNICO_B, tecnicoB))).toBe(
      `NotFoundException: Unidade com ID ${UNIDADE_A} não encontrada`,
    );
    expect(await mensagem(solicitacoes.create(pedido({ unidade_id: ID('naoexiste') }), TECNICO_B, tecnicoB))).toBe(
      `NotFoundException: Unidade com ID ${ID('naoexiste')} não encontrada`,
    );
  });

  it('a unidade e o equipamento têm de ser da planta (antes passavam junto com ela)', async () => {
    await expect(solicitacoes.create(pedido({ planta_id: PLANTA_B, unidade_id: UNIDADE_A }), DONO)).rejects.toThrow('A unidade informada não é da planta informada.');
    await expect(solicitacoes.create(pedido({ planta_id: PLANTA_B, equipamento_id: UC_A }), DONO)).rejects.toThrow(
      'O equipamento informado não é da planta informada.',
    );
    // Para o técnico, o equipamento de fora é como o que não existe
    await expect(solicitacoes.create(pedido({ planta_id: PLANTA_B, equipamento_id: UC_A }), TECNICO_B, tecnicoB)).rejects.toThrow('Equipamento não encontrado');
    expect(await prisma.solicitacoes_servico.count({ where: { planta_id: { in: [PLANTA_A, PLANTA_B] } } })).toBe(0);
  });

  it('pela unidade, a planta vem dela; o técnico cria na planta dele', async () => {
    const criada = await solicitacoes.create(pedido({ unidade_id: UNIDADE_B, equipamento_id: UC_B }), TECNICO_B, tecnicoB);
    expect(criada.planta_id?.trim()).toBe(PLANTA_B);
  });

  it('editar não leva a solicitação para fora do escopo; levar para outra planta conferida passa', async () => {
    const criada = await solicitacoes.create(pedido({ planta_id: PLANTA_B }), TECNICO_B, tecnicoB);

    await expect(solicitacoes.update(criada.id, { planta_id: PLANTA_A } as never, TECNICO_B, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(solicitacoes.update(criada.id, { unidade_id: UNIDADE_A } as never, TECNICO_B, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: criada.id } })).planta_id?.trim()).toBe(PLANTA_B);

    // Quem vê tudo leva para outra planta pela unidade, e a planta vai junto
    await solicitacoes.update(criada.id, { unidade_id: UNIDADE_A } as never, DONO);
    expect((await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: criada.id } })).planta_id?.trim()).toBe(PLANTA_A);
  });

  it('a edição que não mexe no lugar não confere o lugar (dado antigo incoerente não trava)', () => {
    const atual = { planta_id: `${PLANTA_A} `, unidade_id: UNIDADE_A, equipamento_id: null };
    expect(mudouOLugar({ titulo: 'x' } as never, atual)).toBe(false);
    expect(mudouOLugar({ planta_id: PLANTA_A, unidade_id: ` ${UNIDADE_A}`, equipamento_id: '' }, atual)).toBe(false);
    expect(mudouOLugar({ unidade_id: UNIDADE_B }, atual)).toBe(true);
  });
});

// SN-77: a coluna é texto e o id de destino Char(26); com o espaço do fim, a
// busca pelo nome da instalação e o escopo por planta não achavam a solicitação
describe('comOLugarAparado', () => {
  it('apara os ids do lugar; vazio vira null; o resto fica como veio', () => {
    expect(
      comOLugarAparado({ planta_id: 'p1 ', unidade_id: ' u1  ', equipamento_id: '   ', proprietario_id: undefined, titulo: ' x ' }),
    ).toEqual({ planta_id: 'p1', unidade_id: 'u1', equipamento_id: null, proprietario_id: undefined, titulo: ' x ' });
  });
});

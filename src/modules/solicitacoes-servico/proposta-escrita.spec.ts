import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { exceptionFactoryEmPortugues } from '@/common/pipes/mensagens-validacao';
import { SolicitacoesServicoController } from './solicitacoes-servico.controller';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { CondicoesDaPropostaDto, SalvarItensDaPropostaDto, SalvarOutrosCustosDaPropostaDto } from './dto/proposta.dto';

/**
 * As escritas da proposta (SN-94). As quatro rotas (itens, outros custos,
 * condições e recarregar) não conferiam o escopo: quem tinha `solicitacoes.manage` numa
 * planta reescrevia a proposta de outra pelo id. E o corpo era um tipo solto,
 * sem DTO: campo a mais passava, e texto acima da coluna ou número fora do
 * Decimal virava 500 no banco.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: exceptionFactoryEmPortugues,
});
const corpo = <T>(metatype: new () => T, dados: unknown) => pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;
const recusa = async (metatype: new () => unknown, dados: unknown) => {
  try {
    await corpo(metatype, dados);
  } catch (erro) {
    expect(erro).toBeInstanceOf(BadRequestException);
    return ((erro as BadRequestException).getResponse() as { message: string[] }).message.join(' | ');
  }
  throw new Error('o pipe aceitou');
};

/** O que a tela manda (`propostaApi.salvarItens`) */
const itemDaTela = { instrucao_id: 'instrucao01', recurso_id: null, descricao: 'INV-03 · Termografia', unidade: null, quantidade: 1, preco_unitario: 902.08, preco_unitario_original: 880 };

describe('corpo das escritas da proposta (DTO)', () => {
  it('o que a tela manda passa', async () => {
    await expect(corpo(SalvarItensDaPropostaDto, { itens: [itemDaTela] })).resolves.toMatchObject({ itens: [{ preco_unitario: 902.08 }] });
    await expect(
      corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Hospedagem', valor: 1380, faturamento_direto: true }] }),
    ).resolves.toMatchObject({ custos: [{ valor: 1380 }] });
  });

  it('campo a mais, texto vazio ou acima da coluna e número fora do Decimal são 400', async () => {
    expect(await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, id: 'x', ordem: 1 }] })).toMatch(/id|ordem/);
    expect(await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, descricao: '   ' }] })).toContain('Diga o que é cada item da proposta.');
    await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, descricao: 'x'.repeat(201) }] });
    await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, preco_unitario: -1 }] });
    await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, preco_unitario: 10.005 }] });
    await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, preco_unitario: 1e13 }] });
    await recusa(SalvarItensDaPropostaDto, { itens: 'nada' });
    await recusa(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Pedágio', valor: 35, faturamento_direto: 'sim' }] });
    // Revisão de segurança: uma lista dentro da lista passava e dava 500; true e "" viravam número
    await recusa(SalvarItensDaPropostaDto, { itens: [[]] });
    await recusa(SalvarItensDaPropostaDto, { itens: [[itemDaTela]] });
    await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, preco_unitario: '' }] });
    await recusa(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, quantidade: true }] });
    await recusa(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Pedágio', valor: '' }] });
  });

  it('o faturamento direto em texto: "false" é false (a conversão implícita fazia virar true)', async () => {
    await expect(
      corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Pedágio', valor: 35, faturamento_direto: 'false' }] }),
    ).resolves.toMatchObject({ custos: [{ faturamento_direto: false }] });
  });

  it('percentuais: acima de 100 e campo a mais são 400 (o BDI saiu em 29/out/2026); vazio é null (não muda o gravado)', async () => {
    await recusa(CondicoesDaPropostaDto, { bdi_regime: 'SEM_REIDI' });
    await recusa(CondicoesDaPropostaDto, { margem_percentual: 101 });
    await recusa(CondicoesDaPropostaDto, { margem_percentual: 5, margem_extra: 1 });
    await expect(corpo(CondicoesDaPropostaDto, { margem_percentual: '' })).resolves.toMatchObject({ margem_percentual: null });
  });
});

describe('escritas da proposta no escopo da planta (banco real)', () => {
  const prisma = new PrismaService();
  const propostas = new PropostaService(prisma);
  const controller = new SolicitacoesServicoController(
    new SolicitacoesServicoService(prisma, new PermissionScopeService(prisma), propostas),
    propostas,
  );

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testepropesc${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const PREFIXO = 'TESTE-PROP-ESCRITA';

  const comoCliente = { user: { id: DONO_A, role: 'proprietario' } };
  const comoTecnicoB = { user: { id: TECNICO_B, role: 'operador' } };
  const comoAdmin = { user: { id: DONO_B, role: 'admin' } };
  let solicitacaoA: string;

  const apagar = async () => {
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: PREFIXO } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B] } } });
  };
  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });
  const itensDaA = () => prisma.solicitacoes_itens.findMany({ where: { solicitacao_id: solicitacaoA }, orderBy: { ordem: 'asc' } });
  const percentuaisDaA = () =>
    prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: solicitacaoA }, select: { imposto_percentual: true, margem_percentual: true, total_geral: true } });
  let sequencia = 0;
  const novaSolicitacao = async (status: 'REGISTRADA' | 'PROGRAMADA' = 'REGISTRADA') => {
    sequencia += 1;
    return (
      await prisma.solicitacoes_servico.create({
        data: { numero: `${PREFIXO}-${sequencia}`, titulo: `${PREFIXO} ${sequencia}`, descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA_A, solicitante_nome: 'x', local: 'x', status },
      })
    ).id;
  };

  beforeAll(async () => {
    await apagar();
    for (const [id, nome] of [[DONO_A, 'Cliente A'], [DONO_B, 'Cliente B'], [TECNICO_B, 'Técnico B']]) {
      await prisma.usuarios.create({ data: { id, nome, email: `${id}@prop-escrita.teste` } });
    }
    await planta(PLANTA_A, DONO_A, '92.940.000/0001-01');
    await planta(PLANTA_B, DONO_B, '92.940.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    solicitacaoA = (
      await prisma.solicitacoes_servico.create({
        data: { numero: `${PREFIXO}-A`, titulo: `${PREFIXO} A`, descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA_A, solicitante_nome: 'x', local: 'x' },
      })
    ).id;
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('quem está na planta grava (e o total sai recalculado)', async () => {
    const itens = await corpo(SalvarItensDaPropostaDto, { itens: [{ ...itemDaTela, descricao: '  INV-03 · Termografia  ' }] });
    const proposta = await controller.salvarItensDaProposta(solicitacaoA, itens, comoCliente);
    expect(proposta.total_custo).toBe(902.08);
    expect((await itensDaA()).map((i) => i.descricao)).toEqual(['INV-03 · Termografia']);
  });

  it('o técnico de outra planta é recusado nas quatro (404, como o que não existe) e nada muda', async () => {
    const antes = await itensDaA();
    const margemAntes = (await percentuaisDaA()).margem_percentual;
    const itens = await corpo(SalvarItensDaPropostaDto, { itens: [] });
    const custos = await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Intruso', valor: 1 }] });
    const condicoes = await corpo(CondicoesDaPropostaDto, { margem_percentual: 50 });
    for (const escrita of [
      controller.salvarItensDaProposta(solicitacaoA, itens, comoTecnicoB),
      controller.salvarOutrosCustos(solicitacaoA, custos, comoTecnicoB),
      controller.salvarCondicoes(solicitacaoA, condicoes, comoTecnicoB),
      controller.recarregarProposta(solicitacaoA, comoTecnicoB),
    ]) {
      await expect(escrita).rejects.toThrow(new NotFoundException('Solicitação de serviço não encontrada'));
    }
    expect(await itensDaA()).toEqual(antes);
    expect(await prisma.solicitacoes_outros_custos.count({ where: { solicitacao_id: solicitacaoA } })).toBe(0);
    expect((await percentuaisDaA()).margem_percentual).toEqual(margemAntes);
  });

  it('a solicitação que não existe é 404, também com itens (antes, erro de chave estrangeira: 500)', async () => {
    const inexistente = ID('naoexiste');
    const itens = await corpo(SalvarItensDaPropostaDto, { itens: [itemDaTela] });
    const custos = await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Hospedagem', valor: 10 }] });
    const condicoes = await corpo(CondicoesDaPropostaDto, { margem_percentual: 6 });
    await expect(controller.salvarItensDaProposta(inexistente, itens, comoAdmin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.salvarOutrosCustos(inexistente, custos, comoAdmin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.salvarCondicoes(inexistente, condicoes, comoAdmin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('percentuais: o campo vazio não muda o gravado', async () => {
    await controller.salvarCondicoes(solicitacaoA, await corpo(CondicoesDaPropostaDto, { imposto_percentual: 15, margem_percentual: 20 }), comoCliente);
    await controller.salvarCondicoes(solicitacaoA, await corpo(CondicoesDaPropostaDto, { margem_percentual: '', imposto_percentual: 12 }), comoCliente);
    const gravada = await percentuaisDaA();
    expect([Number(gravada.imposto_percentual), Number(gravada.margem_percentual)]).toEqual([12, 20]);
  });

  it('a solicitação programada tem a proposta que o cliente aceitou: escrever é 409', async () => {
    const programada = await novaSolicitacao('PROGRAMADA');
    const itens = await corpo(SalvarItensDaPropostaDto, { itens: [itemDaTela] });
    await expect(controller.salvarItensDaProposta(programada, itens, comoCliente)).rejects.toBeInstanceOf(ConflictException);
    await expect(controller.recarregarProposta(programada, comoCliente)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.solicitacoes_itens.count({ where: { solicitacao_id: programada } })).toBe(0);
  });

  it('imposto e margem com 100% ou mais é 400 e nada fica gravado (o percentual ruim travaria as escritas seguintes)', async () => {
    const antes = await percentuaisDaA();
    // A conta divide por (1 - (imposto + margem))
    await expect(controller.salvarCondicoes(solicitacaoA, await corpo(CondicoesDaPropostaDto, { margem_percentual: 88 }), comoCliente)).rejects.toThrow(
      /somam 100% ou mais/,
    );
    expect(await percentuaisDaA()).toEqual(antes);
    // E a proposta segue gravável
    await expect(controller.salvarItensDaProposta(solicitacaoA, await corpo(SalvarItensDaPropostaDto, { itens: [itemDaTela] }), comoCliente)).resolves.toBeDefined();
  });

  it('duas gravações juntas da mesma lista não dobram as linhas (a trava enfileira)', async () => {
    const solicitacao = await novaSolicitacao();
    const lista = await corpo(SalvarItensDaPropostaDto, { itens: [itemDaTela, { ...itemDaTela, instrucao_id: 'instrucao02', descricao: 'INV-04 · Limpeza' }] });
    await Promise.all([
      controller.salvarItensDaProposta(solicitacao, lista, comoCliente),
      controller.salvarItensDaProposta(solicitacao, lista, comoCliente),
    ]);
    expect(await prisma.solicitacoes_itens.count({ where: { solicitacao_id: solicitacao } })).toBe(2);
  });

  it('excluir a solicitação de outra planta é 404 e ela fica (o remove não recebia o usuário)', async () => {
    const solicitacao = await novaSolicitacao();
    await expect(controller.remove(solicitacao, comoTecnicoB)).rejects.toThrow(new NotFoundException('Solicitação de serviço não encontrada'));
    const { deleted_at } = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: solicitacao }, select: { deleted_at: true } });
    expect(deleted_at).toBeNull();
    await expect(controller.remove(solicitacao, comoCliente)).resolves.toBeUndefined();
  });
});

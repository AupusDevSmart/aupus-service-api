import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { exceptionFactoryEmPortugues } from '@/common/pipes/mensagens-validacao';
import { SolicitacoesServicoController } from './solicitacoes-servico.controller';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { BdiPadraoDto, CondicoesDaPropostaDto, SalvarItensDaPropostaDto, SalvarOutrosCustosDaPropostaDto } from './dto/proposta.dto';
import { BDI_GOINFRA } from './bdi-padrao';
import { descontoDaProposta } from './desconto-da-proposta';

/**
 * O BDI padrão configurável e o desconto da proposta (28/out/2026).
 *
 * - O BDI era fixo na tabela GOINFRA (30,44%), sem lugar para mudar. Agora há o
 *   padrão da empresa, que a solicitação nova copia, e cada solicitação ajusta
 *   o seu; trocar o padrão não reescreve proposta já feita.
 * - O desconto (percentual ou valor) é sobre o total inteiro, com o faturamento
 *   direto, e evita ajustar instrução por instrução.
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

describe('descontoDaProposta', () => {
  it('percentual sobre o total; valor em reais; sem tipo ou sem valor, nada', () => {
    expect(descontoDaProposta('PERCENTUAL', 10, 1504.4)).toEqual({ pedido: 150.44, aplicado: 150.44 });
    expect(descontoDaProposta('VALOR', 500, 1504.4)).toEqual({ pedido: 500, aplicado: 500 });
    expect(descontoDaProposta(null, 10, 1504.4)).toEqual({ pedido: 0, aplicado: 0 });
    expect(descontoDaProposta('VALOR', null, 1504.4)).toEqual({ pedido: 0, aplicado: 0 });
  });

  it('o valor maior que o total para no total: a proposta não fica negativa', () => {
    expect(descontoDaProposta('VALOR', 500, 400)).toEqual({ pedido: 500, aplicado: 400 });
    expect(descontoDaProposta('PERCENTUAL', 100, 400)).toEqual({ pedido: 400, aplicado: 400 });
  });
});

describe('corpo do BDI padrão e do desconto (DTO)', () => {
  it('o padrão leva os nove componentes, de 0 a 100, e nada além', async () => {
    await expect(corpo(BdiPadraoDto, { ...BDI_GOINFRA })).resolves.toMatchObject({ bdi_lucro: 5 });
    const { bdi_lucro: _sem, ...faltando } = BDI_GOINFRA;
    await recusa(BdiPadraoDto, faltando);
    await recusa(BdiPadraoDto, { ...BDI_GOINFRA, bdi_lucro: 101 });
    await recusa(BdiPadraoDto, { ...BDI_GOINFRA, bdi_lucro: -1 });
    await recusa(BdiPadraoDto, { ...BDI_GOINFRA, bdi_lucro: '' });
    await recusa(BdiPadraoDto, { ...BDI_GOINFRA, bdi_regime: 'SEM_REIDI' });
  });

  it('desconto: tipo fora da lista, valor negativo ou com mais de dois centavos é 400; tipo null tira o desconto', async () => {
    await recusa(CondicoesDaPropostaDto, { desconto_tipo: 'BRINDE', desconto_valor: 10 });
    await recusa(CondicoesDaPropostaDto, { desconto_tipo: 'VALOR', desconto_valor: -1 });
    await recusa(CondicoesDaPropostaDto, { desconto_tipo: 'VALOR', desconto_valor: 10.005 });
    await expect(corpo(CondicoesDaPropostaDto, { desconto_tipo: null })).resolves.toMatchObject({ desconto_tipo: null });
    await expect(corpo(CondicoesDaPropostaDto, { desconto_tipo: 'PERCENTUAL', desconto_valor: '12,5'.replace(',', '.') })).resolves.toMatchObject({
      desconto_valor: 12.5,
    });
  });
});

describe('BDI padrão e desconto (banco real)', () => {
  const prisma = new PrismaService();
  const propostas = new PropostaService(prisma);
  const solicitacoes = new SolicitacoesServicoService(prisma, new PermissionScopeService(prisma), propostas);
  const controller = new SolicitacoesServicoController(solicitacoes, propostas);

  const ID = (s: string) => `testebdipadrao${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA = ID('planta');
  const PREFIXO = 'TESTE-BDI-PADRAO';
  const comoPlanejador = { user: { id: DONO, role: 'admin' } };

  const apagar = async () => {
    await prisma.solicitacoes_servico.deleteMany({ where: { OR: [{ numero: { startsWith: PREFIXO } }, { titulo: { startsWith: PREFIXO } }] } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };
  const voltarAoGoinfra = () => prisma.bdi_padrao.upsert({ where: { id: 1 }, create: { id: 1, ...BDI_GOINFRA }, update: { ...BDI_GOINFRA } });

  let sequencia = 0;
  const novaSolicitacao = async () => {
    sequencia += 1;
    return (
      await prisma.solicitacoes_servico.create({
        data: { numero: `${PREFIXO}-${sequencia}`, titulo: `${PREFIXO} ${sequencia}`, descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA, solicitante_nome: 'x', local: 'x' },
      })
    ).id;
  };

  /** Itens de R$ 1.000 e R$ 200 de faturamento direto: com o GOINFRA (30,438%), 1.000 + 304,38 + 200 = 1.504,38 */
  const comProposta = async () => {
    const id = await novaSolicitacao();
    await controller.salvarItensDaProposta(
      id,
      await corpo(SalvarItensDaPropostaDto, { itens: [{ descricao: 'INV-01 · Termografia', quantidade: 1, preco_unitario: 1000 }] }),
      comoPlanejador,
    );
    await controller.salvarOutrosCustos(
      id,
      await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [{ descricao: 'Guindaste', valor: 200, faturamento_direto: true }] }),
      comoPlanejador,
    );
    return id;
  };
  const condicoes = async (id: string, dados: Record<string, unknown>) =>
    controller.salvarCondicoes(id, await corpo(CondicoesDaPropostaDto, dados), comoPlanejador);
  const totais = async (id: string) => {
    const s = await prisma.solicitacoes_servico.findUniqueOrThrow({
      where: { id },
      select: { total_geral: true, total_desconto: true, desconto_tipo: true, desconto_valor: true },
    });
    return { total_geral: Number(s.total_geral), total_desconto: s.total_desconto === null ? null : Number(s.total_desconto), desconto_tipo: s.desconto_tipo };
  };

  beforeAll(async () => {
    await apagar();
    await voltarAoGoinfra();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono', email: `${DONO}@bdi-padrao.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: `${PREFIXO} planta`, cnpj: '91.330.000/0001-01', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
  });
  afterAll(async () => {
    await apagar();
    await voltarAoGoinfra();
    await prisma.$disconnect();
  });

  it('o padrão nasce no GOINFRA (30,44% na planilha, 30,438% com as três casas)', async () => {
    const padrao = await controller.obterBdiPadrao();
    expect(padrao).toMatchObject({ ...BDI_GOINFRA, bdi_percentual: 30.438 });
  });

  it('trocar o padrão vale para a solicitação nova; a que já existe fica com o seu', async () => {
    const antiga = await comProposta();
    await controller.salvarBdiPadrao(await corpo(BdiPadraoDto, { ...BDI_GOINFRA, bdi_lucro: 10, bdi_issqn: 5 }), comoPlanejador);

    const nova = await solicitacoes.create(
      { titulo: `${PREFIXO} nova`, descricao: 'x', tipo: 'INSPECAO' as never, planta_id: PLANTA } as never,
      DONO,
    );
    const daNova = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: nova.id }, select: { bdi_lucro: true, bdi_issqn: true } });
    expect([Number(daNova.bdi_lucro), Number(daNova.bdi_issqn)]).toEqual([10, 5]);

    const daAntiga = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: antiga }, select: { bdi_lucro: true, total_geral: true } });
    expect([Number(daAntiga.bdi_lucro), Number(daAntiga.total_geral)]).toEqual([5, 1504.38]);
    await voltarAoGoinfra();
  });

  it('o padrão com impostos de 100% ou mais é 400 e nada muda', async () => {
    await expect(
      controller.salvarBdiPadrao(await corpo(BdiPadraoDto, { ...BDI_GOINFRA, bdi_issqn: 92 }), comoPlanejador),
    ).rejects.toThrow(/somam 100% ou mais/);
    expect(await controller.obterBdiPadrao()).toMatchObject({ bdi_issqn: 6.5 });
  });

  it('desconto percentual: sobre o total inteiro, o faturamento direto junto', async () => {
    const id = await comProposta();
    const proposta = await condicoes(id, { desconto_tipo: 'PERCENTUAL', desconto_valor: 10 });
    expect(proposta).toMatchObject({ desconto_tipo: 'PERCENTUAL', desconto_valor: 10, total_desconto: 150.44, total_geral: 1353.94 });
    expect(await totais(id)).toEqual({ total_geral: 1353.94, total_desconto: 150.44, desconto_tipo: 'PERCENTUAL' });
  });

  it('desconto em reais; trocar os valores refaz o total com ele; tirar o desconto volta ao total cheio', async () => {
    const id = await comProposta();
    await condicoes(id, { desconto_tipo: 'VALOR', desconto_valor: 500 });
    expect(await totais(id)).toEqual({ total_geral: 1004.38, total_desconto: 500, desconto_tipo: 'VALOR' });

    // O percentual também acompanha os valores: aqui o de reais segue fixo
    await controller.salvarOutrosCustos(id, await corpo(SalvarOutrosCustosDaPropostaDto, { custos: [] }), comoPlanejador);
    expect(await totais(id)).toEqual({ total_geral: 804.38, total_desconto: 500, desconto_tipo: 'VALOR' });

    await condicoes(id, { desconto_tipo: null });
    expect(await totais(id)).toEqual({ total_geral: 1304.38, total_desconto: null, desconto_tipo: null });
  });

  it('desconto maior que o total, percentual acima de 100 ou tipo sem valor é 400 e nada muda', async () => {
    const id = await comProposta();
    await expect(condicoes(id, { desconto_tipo: 'VALOR', desconto_valor: 2000 })).rejects.toThrow(/passa do total da proposta/);
    await expect(condicoes(id, { desconto_tipo: 'PERCENTUAL', desconto_valor: 101 })).rejects.toThrow(/100%/);
    await expect(condicoes(id, { desconto_tipo: 'VALOR' })).rejects.toThrow(/valor do desconto/);
    // O valor sem o tipo ficaria guardado e voltaria calado depois
    await expect(condicoes(id, { desconto_valor: 50 })).rejects.toThrow(/percentual ou em reais/);
    expect(await totais(id)).toEqual({ total_geral: 1504.38, total_desconto: null, desconto_tipo: null });
  });

  it('o total que cai abaixo do desconto em reais: o aplicado para no total, e a leitura mostra os dois', async () => {
    const id = await comProposta();
    await condicoes(id, { desconto_tipo: 'VALOR', desconto_valor: 1000 });
    await controller.salvarItensDaProposta(id, await corpo(SalvarItensDaPropostaDto, { itens: [] }), comoPlanejador);
    const proposta = await propostas.obter(id);
    expect(proposta).toMatchObject({ desconto_valor: 1000, total_desconto: 200, total_geral: 0 });
  });

  it('o BDI da solicitação se ajusta junto com o desconto, numa escrita só', async () => {
    const id = await comProposta();
    const proposta = await condicoes(id, { ...BDI_GOINFRA, bdi_lucro: 0, desconto_tipo: 'VALOR', desconto_valor: 100 });
    // Sem o lucro, o BDI do GOINFRA vai a 24,227%: 1.000 + 242,27 + 200 - 100
    expect(proposta).toMatchObject({ bdi_percentual: 24.227, total_bdi: 242.27, total_desconto: 100, total_geral: 1342.27 });
  });
});

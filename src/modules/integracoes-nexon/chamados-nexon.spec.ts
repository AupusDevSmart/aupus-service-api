import { ConflictException, ExecutionContext, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '@/core';
import type { SolicitacoesServicoService } from '../solicitacoes-servico/solicitacoes-servico.service';
import { montarSolicitacao } from './chamados-nexon';
import { ChamadosNexonService } from './chamados-nexon.service';
import { TokenNexonGuard } from './token-nexon.guard';
import { ChamadoNexonDto } from './dto/chamado-nexon.dto';

const chamado = (extra: Partial<ChamadoNexonDto> = {}): ChamadoNexonDto => ({
  nexon_chamado_id: 'chm_1',
  numero: 12,
  titulo: 'Inversor desligado',
  descricao: 'Parou às 10h',
  motivo: 'FALHA',
  prioridade: 'ALTA',
  equipamento_id: 'EQ1',
  unidade_id: 'UN1',
  planta_id: 'PL1',
  proprietario_id: 'US1',
  autor_nome: 'Maria',
  aberto_em: '2026-10-20T13:00:00.000Z',
  observacao: 'Urgente, cliente ligou',
  ...extra,
});

describe('montarSolicitacao', () => {
  it('vira manutenção corretiva de origem SISTEMA com os ids sincronizados', () => {
    const s = montarSolicitacao(chamado(), {
      planta_id: 'PL1',
      equipamento: { id: 'EQ1', nome: 'Inversor 01' },
      unidade_id: 'UN1',
      proprietario_id: 'US1',
      planta_nome: 'Fazenda X',
    });
    expect(s).toMatchObject({
      tipo: 'MANUTENCAO_CORRETIVA',
      origem: 'SISTEMA',
      prioridade: 'ALTA',
      planta_id: 'PL1',
      unidade_id: 'UN1',
      equipamento_id: 'EQ1',
      proprietario_id: 'US1',
      local: 'Inversor 01',
      solicitante_nome: 'Maria (NexON)',
      nexon_chamado_id: 'chm_1',
      faltando: [],
    });
    expect(s.data_solicitacao.toISOString()).toBe('2026-10-20T13:00:00.000Z');
  });

  // Nenhuma tela mostra as observações da solicitação, e a programação copia a descrição
  it('o contexto do chamado vai no fim da descrição, que a programação e o cartão da origem mostram', () => {
    const s = montarSolicitacao(chamado(), {
      planta_id: 'PL1',
      equipamento: { id: 'EQ1', nome: 'Inversor 01' },
      unidade_id: 'UN1',
      proprietario_id: 'US1',
      planta_nome: 'Fazenda X',
    });
    expect(s.descricao.startsWith('Parou às 10h\n\n')).toBe(true);
    expect(s.descricao).toContain('Chamado #12 do NexON (chm_1).');
    expect(s.descricao).toContain('Motivo: Falha no equipamento.');
    expect(s.descricao).toContain('Observação do encaminhamento: Urgente, cliente ligou');
    expect(s).not.toHaveProperty('observacoes');
  });

  it('id que não existe aqui vira texto na descrição, não derruba a entrega', () => {
    const s = montarSolicitacao(chamado({ prioridade: null, autor_nome: null }), {
      planta_id: 'PL1',
      equipamento: null,
      unidade_id: null,
      proprietario_id: null,
      planta_nome: 'Fazenda X',
    });
    expect(s.equipamento_id).toBeNull();
    expect(s.unidade_id).toBeNull();
    expect(s.proprietario_id).toBeNull();
    expect(s.local).toBe('Fazenda X');
    expect(s.prioridade).toBe('MEDIA');
    expect(s.solicitante_nome).toBe('NexON (NexON)');
    expect(s.faltando).toEqual(['equipamento EQ1', 'unidade UN1', 'proprietário US1']);
    expect(s.descricao).toContain('Não sincronizado com o Smart Service: equipamento EQ1');
  });

  it('unidade informada que não existe aqui: fica a do equipamento, e a informada segue como faltando', () => {
    const s = montarSolicitacao(chamado({ unidade_id: 'UN9' }), {
      planta_id: 'PL1',
      equipamento: { id: 'EQ1', nome: 'Inversor 01' },
      unidade_id: 'UN1',
      proprietario_id: 'US1',
      planta_nome: 'Fazenda X',
    });
    expect(s.unidade_id).toBe('UN1');
    expect(s.faltando).toEqual(['unidade UN9']);
  });

  it('a planta gravada é a lida do banco, não a do pedido', () => {
    const s = montarSolicitacao(chamado({ planta_id: ' PL1 ' }), { planta_id: 'PL1', planta_nome: 'Fazenda X' });
    expect(s.planta_id).toBe('PL1');
  });
});

describe('TokenNexonGuard', () => {
  const ctx = (authorization?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization }, ip: '10.0.0.1' }) }),
    }) as unknown as ExecutionContext;
  const guard = new TokenNexonGuard();
  const TOKEN = 'a'.repeat(40);
  const anterior = process.env.NEXON_CHAMADOS_TOKEN;
  afterEach(() => {
    process.env.NEXON_CHAMADOS_TOKEN = anterior;
  });

  it('fecha a rota quando o segredo não está configurado', () => {
    delete process.env.NEXON_CHAMADOS_TOKEN;
    expect(() => guard.canActivate(ctx('Bearer qualquer'))).toThrow(UnauthorizedException);
  });

  it('segredo curto conta como não configurado, mesmo com o Bearer igual', () => {
    process.env.NEXON_CHAMADOS_TOKEN = 'segredo-123';
    expect(() => guard.canActivate(ctx('Bearer segredo-123'))).toThrow(UnauthorizedException);
  });

  it('aceita só o Bearer certo, com a mesma recusa para tudo', () => {
    process.env.NEXON_CHAMADOS_TOKEN = TOKEN;
    expect(guard.canActivate(ctx(`Bearer ${TOKEN}`))).toBe(true);
    expect(() => guard.canActivate(ctx(`Bearer ${TOKEN}b`))).toThrow('Token de integração inválido');
    expect(() => guard.canActivate(ctx(undefined))).toThrow('Token de integração inválido');
    delete process.env.NEXON_CHAMADOS_TOKEN;
    expect(() => guard.canActivate(ctx(`Bearer ${TOKEN}`))).toThrow('Token de integração inválido');
  });
});

describe('ChamadosNexonService', () => {
  type Existente = { id: string; numero: string; status: string; deleted_at: Date | null };
  const montar = (existente: Existente | null = null) => {
    const prisma = {
      solicitacoes_servico: { findUnique: jest.fn().mockResolvedValue(existente), create: jest.fn() },
      historico_solicitacao_servico: { create: jest.fn() },
      notificacoes_eventos: { create: jest.fn() },
      plantas: { findFirst: jest.fn().mockResolvedValue({ id: 'PL1', nome: 'Fazenda X', proprietario_id: 'US1' }) },
      equipamentos: { findFirst: jest.fn().mockResolvedValue({ id: 'EQ1', nome: 'Inversor 01', unidade_id: 'UN1' }) },
      unidades: { findFirst: jest.fn().mockResolvedValue({ id: 'UN1' }) },
      // Sem a linha do BDI padrão, o GOINFRA (28/out/2026)
      bdi_padrao: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const solicitacoes = { gerarNumeroSolicitacao: jest.fn().mockResolvedValue('2026-0005') };
    const service = new ChamadosNexonService(
      prisma as unknown as PrismaService,
      solicitacoes as unknown as SolicitacoesServicoService,
    );
    return { prisma, solicitacoes, service };
  };
  const aberta = (extra: Partial<Existente> = {}): Existente => ({
    id: 'S1',
    numero: '2026-0005',
    status: 'REGISTRADA',
    deleted_at: null,
    ...extra,
  });

  it('cria a solicitação e grava a trilha RECEBIDA_NEXON', async () => {
    const { prisma, service } = montar();
    prisma.solicitacoes_servico.create.mockResolvedValue({ id: 'S1', numero: '2026-0005' });
    const r = await service.receber(chamado(), { ip: '127.0.0.1', user_agent: 'axios' });
    expect(r).toEqual({ id: 'S1', numero: '2026-0005', criada: true });
    expect(prisma.solicitacoes_servico.create.mock.calls[0][0].data).toMatchObject({
      nexon_chamado_id: 'chm_1',
      numero: '2026-0005',
      status: 'REGISTRADA',
      // O BDI padrão da empresa, como a do formulário (28/out/2026); sem a linha, o GOINFRA
      bdi_lucro: 5,
      bdi_issqn: 6.5,
    });
    const h = prisma.historico_solicitacao_servico.create.mock.calls[0][0].data;
    expect(h.acao).toBe('RECEBIDA_NEXON');
    expect(h.dados_extras).toMatchObject({ nexon_chamado_id: 'chm_1', nexon_numero: 12, ip: '127.0.0.1' });
  });

  // O Char(26) devolve o id com espaço: gravado assim, a busca e o escopo perdiam a solicitação (SN-77)
  it('grava os ids do lugar aparados e avisa quem programa, como a do formulário', async () => {
    const { prisma, service } = montar();
    prisma.plantas.findFirst.mockResolvedValue({ id: 'PL1 ', nome: 'Fazenda X', proprietario_id: 'US1 ' });
    prisma.equipamentos.findFirst.mockResolvedValue({ id: 'EQ1 ', nome: 'Inversor 01', unidade_id: 'UN1 ' });
    prisma.unidades.findFirst.mockResolvedValue({ id: 'UN1 ' });
    prisma.solicitacoes_servico.create.mockResolvedValue({ id: 'S1', numero: '2026-0005' });
    await service.receber(chamado({ planta_id: 'PL1 ', proprietario_id: 'US1 ' }));
    expect(prisma.solicitacoes_servico.create.mock.calls[0][0].data).toMatchObject({
      planta_id: 'PL1',
      unidade_id: 'UN1',
      equipamento_id: 'EQ1',
      proprietario_id: 'US1',
    });
    expect(prisma.notificacoes_eventos.create.mock.calls[0][0].data).toMatchObject({
      evento: 'solicitacao.aberta',
      entidade: 'solicitacao_servico',
      entidade_id: 'S1',
      ator_id: null,
    });
  });

  it('segunda entrega do chamado com a solicitação aberta devolve a mesma', async () => {
    const { prisma, service } = montar(aberta({ status: 'PROGRAMADA' }));
    const r = await service.receber(chamado());
    expect(r).toEqual({ id: 'S1', numero: '2026-0005', criada: false });
    expect(prisma.solicitacoes_servico.create).not.toHaveBeenCalled();
  });

  // O equipamento voltou a falhar e o operador encaminhou de novo: antes, 200 e nada no Service
  it.each([
    ['finalizada', aberta({ status: 'FINALIZADA' })],
    ['excluída', aberta({ deleted_at: new Date('2026-10-21T12:00:00Z') })],
  ])('reencaminhar o chamado de uma solicitação %s é 409, não 200 calado', async (estado, existente) => {
    const { prisma, service } = montar(existente);
    await expect(service.receber(chamado())).rejects.toBeInstanceOf(ConflictException);
    await expect(service.receber(chamado())).rejects.toThrow(`solicitação 2026-0005, ${estado}`);
    expect(prisma.solicitacoes_servico.create).not.toHaveBeenCalled();
  });

  it('entrega simultânea: quem perdeu a corrida devolve a do vencedor', async () => {
    const { prisma, service } = montar();
    prisma.solicitacoes_servico.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(aberta({ id: 'S9', numero: '2026-0009' }));
    prisma.solicitacoes_servico.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['nexon_chamado_id'] },
      }),
    );
    expect(await service.receber(chamado())).toEqual({ id: 'S9', numero: '2026-0009', criada: false });
  });

  it('equipamento pela regra da planta do formulário (unidade, UC pai, coluna antiga só sem unidade)', async () => {
    const { prisma, service } = montar();
    prisma.solicitacoes_servico.create.mockResolvedValue({ id: 'S1', numero: '2026-0005' });
    await service.receber(chamado());
    const onde = prisma.equipamentos.findFirst.mock.calls[0][0].where;
    expect(onde.OR).toEqual([
      { unidade: { planta_id: { in: ['PL1'] } } },
      { unidade_id: null, equipamento_pai: { unidade: { planta_id: { in: ['PL1'] } } } },
      { unidade_id: null, planta_id: { in: ['PL1'] }, OR: [{ equipamento_pai_id: null }, { equipamento_pai: { unidade_id: null } }] },
    ]);
  });

  it('equipamento, unidade e proprietário de outra planta não entram', async () => {
    const { prisma, service } = montar();
    prisma.equipamentos.findFirst.mockResolvedValue(null);
    prisma.unidades.findFirst.mockResolvedValue(null);
    prisma.solicitacoes_servico.create.mockResolvedValue({ id: 'S1', numero: '2026-0005' });
    await service.receber(chamado({ proprietario_id: 'OUTRO' }));
    expect(prisma.unidades.findFirst.mock.calls[0][0].where.planta_id).toBe('PL1');
    const data = prisma.solicitacoes_servico.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ equipamento_id: null, unidade_id: null, proprietario_id: null });
    expect(data.descricao).toContain('proprietário OUTRO');
  });

  it('planta que não está no Service é 422', async () => {
    const { prisma, service } = montar();
    prisma.plantas.findFirst.mockResolvedValue(null);
    await expect(service.receber(chamado())).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

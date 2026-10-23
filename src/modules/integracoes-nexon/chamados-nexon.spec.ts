import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    expect(s.observacoes).toContain('Chamado #12 do NexON');
    expect(s.observacoes).toContain('Motivo: Falha no equipamento.');
    expect(s.observacoes).toContain('Urgente, cliente ligou');
  });

  it('id que não existe aqui vira texto, não derruba a entrega', () => {
    const s = montarSolicitacao(chamado({ prioridade: null, autor_nome: null }), {
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
    expect(s.observacoes).toContain('Não sincronizado com o Smart Service: equipamento EQ1');
  });
});

describe('TokenNexonGuard', () => {
  const ctx = (authorization?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as any;
  const guard = new TokenNexonGuard();
  const anterior = process.env.NEXON_CHAMADOS_TOKEN;
  afterEach(() => {
    process.env.NEXON_CHAMADOS_TOKEN = anterior;
  });

  it('fecha a rota quando o segredo não está configurado', () => {
    delete process.env.NEXON_CHAMADOS_TOKEN;
    expect(() => guard.canActivate(ctx('Bearer qualquer'))).toThrow(UnauthorizedException);
  });

  it('aceita só o Bearer certo', () => {
    process.env.NEXON_CHAMADOS_TOKEN = 'segredo-123';
    expect(guard.canActivate(ctx('Bearer segredo-123'))).toBe(true);
    expect(() => guard.canActivate(ctx('Bearer segredo-124'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(UnauthorizedException);
  });
});

describe('ChamadosNexonService', () => {
  const montar = (existente: any = null) => {
    const prisma: any = {
      solicitacoes_servico: { findUnique: jest.fn().mockResolvedValue(existente), create: jest.fn() },
      historico_solicitacao_servico: { create: jest.fn() },
      plantas: { findFirst: jest.fn().mockResolvedValue({ id: 'PL1', nome: 'Fazenda X', proprietario_id: 'US1' }) },
      equipamentos: { findFirst: jest.fn().mockResolvedValue({ id: 'EQ1', nome: 'Inversor 01', unidade_id: 'UN1' }) },
      unidades: { findFirst: jest.fn().mockResolvedValue({ id: 'UN1' }) },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    const solicitacoes: any = { gerarNumeroSolicitacao: jest.fn().mockResolvedValue('2026-0005') };
    return { prisma, solicitacoes, service: new ChamadosNexonService(prisma, solicitacoes) };
  };

  it('cria a solicitação e grava a trilha RECEBIDA_NEXON', async () => {
    const { prisma, service } = montar();
    prisma.solicitacoes_servico.create.mockResolvedValue({ id: 'S1', numero: '2026-0005' });
    const r = await service.receber(chamado(), { ip: '127.0.0.1', user_agent: 'axios' });
    expect(r).toEqual({ id: 'S1', numero: '2026-0005', criada: true });
    expect(prisma.solicitacoes_servico.create.mock.calls[0][0].data).toMatchObject({
      nexon_chamado_id: 'chm_1',
      numero: '2026-0005',
      status: 'REGISTRADA',
    });
    const h = prisma.historico_solicitacao_servico.create.mock.calls[0][0].data;
    expect(h.acao).toBe('RECEBIDA_NEXON');
    expect(h.dados_extras).toMatchObject({ nexon_chamado_id: 'chm_1', nexon_numero: 12, ip: '127.0.0.1' });
  });

  it('segunda entrega do mesmo chamado devolve a mesma solicitação', async () => {
    const { prisma, service } = montar({ id: 'S1', numero: '2026-0005' });
    const r = await service.receber(chamado());
    expect(r).toEqual({ id: 'S1', numero: '2026-0005', criada: false });
    expect(prisma.solicitacoes_servico.create).not.toHaveBeenCalled();
  });

  it('entrega simultânea: quem perdeu a corrida devolve a do vencedor', async () => {
    const { prisma, service } = montar();
    prisma.solicitacoes_servico.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'S9', numero: '2026-0009' });
    prisma.solicitacoes_servico.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['nexon_chamado_id'] },
      }),
    );
    expect(await service.receber(chamado())).toEqual({ id: 'S9', numero: '2026-0009', criada: false });
  });

  it('equipamento, unidade e proprietário de outra planta não entram', async () => {
    const { prisma, service } = montar();
    prisma.equipamentos.findFirst.mockResolvedValue(null);
    prisma.unidades.findFirst.mockResolvedValue(null);
    prisma.solicitacoes_servico.create.mockResolvedValue({ id: 'S1', numero: '2026-0005' });
    await service.receber(chamado({ proprietario_id: 'OUTRO' }));
    expect(prisma.equipamentos.findFirst.mock.calls[0][0].where.OR).toEqual([
      { planta_id: 'PL1' },
      { unidade: { planta_id: 'PL1' } },
    ]);
    expect(prisma.unidades.findFirst.mock.calls[0][0].where.planta_id).toBe('PL1');
    const data = prisma.solicitacoes_servico.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ equipamento_id: null, unidade_id: null, proprietario_id: null });
    expect(data.observacoes).toContain('proprietário OUTRO');
  });

  it('planta que não está no Service é 422', async () => {
    const { prisma, service } = montar();
    prisma.plantas.findFirst.mockResolvedValue(null);
    await expect(service.receber(chamado())).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

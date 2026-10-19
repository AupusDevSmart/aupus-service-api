import { BadRequestException } from '@nestjs/common';
import { CondicaoOS, PermissionScopeService, PrioridadeOS, PrismaService, TipoOS } from '@/core';
import { ProgramacaoOSService } from './programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { AVULSA_ANTIGA_RECUSADA, ORIGEM_AVULSA_RECUSADA, exigirOrigem } from './origem-exigida';

/**
 * Toda OS tem origem (SN-69): a programação MANUAL (sem anomalia, solicitação,
 * plano nem tarefa) não se cria mais, e a origem aponta para o que a originou.
 * As avulsas que já existem continuam legíveis; editar ou aprovar uma delas
 * exige escolher a origem.
 */
describe('origem exigida (regra)', () => {
  it('manual, ou sem origem: recusa, dizendo o caminho do serviço avulso', () => {
    expect(() => exigirOrigem({ origem: 'MANUAL', tarefas: 0 })).toThrow(ORIGEM_AVULSA_RECUSADA);
    expect(() => exigirOrigem({ origem: undefined, tarefas: 0 })).toThrow(/registre uma solicitação de serviço/);
    expect(() => exigirOrigem({ origem: 'MANUAL', tarefas: 0 }, { avulsaAntiga: true })).toThrow(AVULSA_ANTIGA_RECUSADA);
  });

  it.each([
    [{ origem: 'ANOMALIA', anomalia_id: '  ', tarefas: 0 }, 'qual anomalia'],
    [{ origem: 'SOLICITACAO_SERVICO', tarefas: 0 }, 'qual solicitação'],
    [{ origem: 'TAREFA', tarefas: 0 }, 'as tarefas'],
    [{ origem: 'PLANO_MANUTENCAO', tarefas: 0 }, 'as tarefas'],
  ])('a origem sem o que a originou: recusa (%j)', (programacao, frase) => {
    expect(() => exigirOrigem(programacao)).toThrow(frase);
  });

  it('a origem com o que a originou passa (a solicitação também pelo dados_origem, como a tela manda)', () => {
    expect(() => exigirOrigem({ origem: 'ANOMALIA', anomalia_id: 'an1', tarefas: 0 })).not.toThrow();
    expect(() => exigirOrigem({ origem: 'SOLICITACAO_SERVICO', dados_origem: { solicitacaoServicoId: 'ss1' }, tarefas: 0 })).not.toThrow();
    expect(() => exigirOrigem({ origem: 'PLANO_MANUTENCAO', tarefas: 3 })).not.toThrow();
  });
});

describe('origem exigida (banco real)', () => {
  const prisma = new PrismaService();
  const programacoes = new ProgramacaoOSService(prisma, new PermissionScopeService(prisma));
  const PREFIXO = 'TESTE-ORIGEM-EXIGIDA';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    const oss = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs } }, select: { id: true } })).map((o) => o.id);
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...progs, ...oss].map((i) => i.trim()) } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
  };

  beforeAll(async () => {
    await limpar();
    planta = await criarPlantaDeTeste(prisma, 'origemexigida', '95.000.000/0001-69');
  });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const pedido = (extra: Record<string, unknown>) =>
    ({
      descricao: `${PREFIXO} serviço`,
      condicoes: CondicaoOS.FUNCIONANDO,
      tipo: TipoOS.CORRETIVA,
      prioridade: PrioridadeOS.MEDIA,
      planta_id: planta.id,
      ...extra,
    }) as never;

  /** Uma programação avulsa de antes da regra, como as que existem no banco */
  const avulsaAntiga = () =>
    prisma.programacoes_os.create({
      data: {
        codigo: `${PREFIXO}-AVULSA`, descricao: `${PREFIXO} avulsa antiga`, condicoes: 'FUNCIONANDO', tipo: 'CORRETIVA', origem: 'MANUAL',
        tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(),
      },
    });

  it('criar manual: 400, e nada é gravado', async () => {
    await expect(programacoes.criar(pedido({ origem: 'MANUAL' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.programacoes_os.count({ where: { descricao: { startsWith: PREFIXO } } })).toBe(0);
  });

  it('criar da solicitação: passa, e a solicitação fica programada', async () => {
    const origem = await planta.origem();
    await programacoes.criar(pedido(origem));
    const solicitacao = await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: origem.solicitacao_servico_id } });
    expect(solicitacao.status).toBe('PROGRAMADA');
  });

  it('a avulsa antiga continua legível', async () => {
    const antiga = await avulsaAntiga();
    expect(await programacoes.buscarPorId(antiga.id)).toMatchObject({ origem: 'MANUAL' });
  });

  it('editar a avulsa antiga sem escolher a origem: 400; escolhendo a solicitação (pela API), passa', async () => {
    const antiga = await avulsaAntiga();
    await expect(programacoes.atualizar(antiga.id, { descricao: `${PREFIXO} editada` } as never)).rejects.toThrow(AVULSA_ANTIGA_RECUSADA);

    const origem = await planta.origem();
    await programacoes.atualizar(antiga.id, origem as never);

    expect(await prisma.programacoes_os.findUniqueOrThrow({ where: { id: antiga.id } })).toMatchObject({ origem: 'SOLICITACAO_SERVICO' });
    expect((await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: origem.solicitacao_servico_id } })).status).toBe('PROGRAMADA');
  });

  it('aprovar a avulsa antiga: 400 (a OS nasceria sem origem), e nenhuma OS é criada', async () => {
    const antiga = await avulsaAntiga();
    await expect(programacoes.aprovar(antiga.id, {} as never)).rejects.toThrow(AVULSA_ANTIGA_RECUSADA);
    expect(await prisma.ordens_servico.count({ where: { programacao_id: antiga.id } })).toBe(0);
    expect((await prisma.programacoes_os.findUniqueOrThrow({ where: { id: antiga.id } })).status).toBe('PENDENTE');
  });
});

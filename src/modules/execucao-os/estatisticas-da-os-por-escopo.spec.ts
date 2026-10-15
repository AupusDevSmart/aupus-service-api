import { PermissionScopeService, PrismaService } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';

/**
 * As estatísticas da listagem de OS (pendentes, atrasadas, críticas…) no
 * escopo de quem lista (SN-40). A lista já filtrava pela planta, mas os
 * números do cabeçalho contavam as OS de todas as plantas: o técnico de campo
 * e o cliente viam quantas OS críticas e atrasadas os outros tinham. Contra
 * Postgres real.
 */
describe('estatísticas da OS no escopo da planta (banco real)', () => {
  const prisma = new PrismaService();
  const execucoes = new ExecucaoOSService(prisma, new PermissionScopeService(prisma));

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testeestatosescopo${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const PREFIXO = 'TESTE-ESTAT-OS-ESCOPO';

  const apagar = async () => {
    await prisma.ordens_servico.deleteMany({ where: { numero_os: { startsWith: PREFIXO } } });
    await prisma.programacoes_os.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });

  /** OS crítica e atrasada (programada para ontem) na planta. */
  const osCriticaAtrasada = async (lado: string, plantaId: string) => {
    const comum = { descricao: 'x', condicoes: 'FUNCIONANDO', tipo: 'CORRETIVA', origem: 'MANUAL', tempo_estimado: 1, duracao_estimada: 1, planta_id: plantaId } as const;
    const programacao = await prisma.programacoes_os.create({ data: { ...comum, codigo: `${PREFIXO}-${lado}` } });
    await prisma.ordens_servico.create({
      data: { ...comum, programacao_id: programacao.id, numero_os: `${PREFIXO}-${lado}`, prioridade: 'CRITICA', data_hora_programada: new Date(Date.now() - 86_400_000) },
    });
  };

  beforeAll(async () => {
    await apagar();
    for (const id of [DONO_A, DONO_B, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@estat-os-escopo.teste` } });
    await planta(PLANTA_A, DONO_A, '87.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '87.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await osCriticaAtrasada('A', PLANTA_A);
    await osCriticaAtrasada('B', PLANTA_B);
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('o técnico conta só as OS das plantas em que atua', async () => {
    const { pagination, stats } = await execucoes.listar({ page: 1, limit: 10 } as never, { id: TECNICO_B, role: 'operador' });
    expect(pagination.total).toBe(1);
    expect([stats.pendentes, stats.criticas, stats.atrasadas]).toEqual([1, 1, 1]);
  });

  it('o cliente conta só as da planta dele', async () => {
    const { stats } = await execucoes.listar({ page: 1, limit: 10 } as never, { id: DONO_A, role: 'proprietario' });
    expect([stats.pendentes, stats.criticas, stats.atrasadas]).toEqual([1, 1, 1]);
  });

  it('quem vê todas as plantas conta todas', async () => {
    const { stats } = await execucoes.listar({ page: 1, limit: 10 } as never, { id: DONO_A, role: 'gerente' });
    expect(stats.criticas).toBeGreaterThanOrEqual(2);
  });
});

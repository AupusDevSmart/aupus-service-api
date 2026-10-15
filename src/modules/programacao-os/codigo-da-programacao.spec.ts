import { CondicaoOS, OrigemOS, PermissionScopeService, PrioridadeOS, PrismaService, TipoOS } from '@/core';
import { ProgramacaoOSService } from './programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';

/**
 * O código da programação (PRG-ANO-000) não repete. Era a contagem + 1: depois
 * de qualquer exclusão o próximo código já existia e a criação falhava no índice
 * único — o cron das preventivas falhou assim em 15/10/2026. Contra Postgres real.
 */
describe('código da programação (banco real)', () => {
  const prisma = new PrismaService();
  const programacoes = new ProgramacaoOSService(prisma, new PermissionScopeService(prisma));
  const PREFIXO = 'TESTE-CODIGO-PRG';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
  };

  beforeAll(async () => {
    await limpar();
    planta = await criarPlantaDeTeste(prisma, 'codigoprg', '95.000.000/0001-04');
  });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const nova = (rotulo: string) =>
    programacoes.criar({
      descricao: `${PREFIXO} ${rotulo}`,
      condicoes: CondicaoOS.FUNCIONANDO,
      tipo: TipoOS.CORRETIVA,
      prioridade: PrioridadeOS.MEDIA,
      origem: OrigemOS.MANUAL,
      planta_id: planta.id,
    } as never);

  const numero = (codigo: string) => Number(codigo.split('-')[2]);

  it('depois de excluir uma programação, o próximo código não repete um que existe', async () => {
    const primeira = await nova('1');
    const segunda = await nova('2');
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: primeira.id } });
    await prisma.programacoes_os.delete({ where: { id: primeira.id } });

    const terceira = await nova('3');

    expect(numero(terceira.codigo)).toBe(numero(segunda.codigo) + 1);
  });

  it('criações ao mesmo tempo recebem códigos diferentes', async () => {
    const criadas = await Promise.all(['a', 'b', 'c', 'd'].map(nova));
    expect(new Set(criadas.map((p) => p.codigo)).size).toBe(4);
  });
});

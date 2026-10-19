import { CondicaoOS, PermissionScopeService, PrioridadeOS, PrismaService, TipoOS } from '@/core';
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
    const oss = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs } }, select: { id: true } })).map((o) => o.id);
    await prisma.historico_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss } } });
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

  const nova = async (rotulo: string) =>
    programacoes.criar({
      descricao: `${PREFIXO} ${rotulo}`,
      condicoes: CondicaoOS.FUNCIONANDO,
      tipo: TipoOS.CORRETIVA,
      prioridade: PrioridadeOS.MEDIA,
      ...(await planta.origem()),
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

  /**
   * O número da OS (OSM-ANO-0000) tinha o mesmo defeito: o maior por ordem
   * alfabética ("10000" antes de "9999") e sem trava (duas aprovações juntas
   * batiam no índice único). Achado na revisão do SN-36.
   */
  describe('número da OS', () => {
    const aprovada = async (rotulo: string) => {
      const prog = await nova(rotulo);
      await programacoes.aprovar(prog.id, {});
      return prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    };
    const sequencial = (numero: string) => Number(numero.split('-')[2]);

    it('o próximo é o maior numérico + 1, não o maior como texto', async () => {
      const primeira = await aprovada('os-1');
      const prefixo = primeira.numero_os.slice(0, primeira.numero_os.lastIndexOf('-') + 1);
      await prisma.ordens_servico.update({ where: { id: primeira.id }, data: { numero_os: `${prefixo}10000` } });

      const proxima = await aprovada('os-2');

      expect(proxima.numero_os).toBe(`${prefixo}10001`);
    });

    it('aprovações ao mesmo tempo recebem números diferentes', async () => {
      const progs = await Promise.all(['os-a', 'os-b', 'os-c'].map(nova));
      await Promise.all(progs.map((p) => programacoes.aprovar(p.id, {})));
      const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs.map((p) => p.id) } } });
      expect(new Set(oss.map((o) => sequencial(o.numero_os))).size).toBe(3);
    });
  });
});

import { AtivosFuncionaisService, PermissionScopeService, PrismaService } from '@/core';
import { PrevisaoDaAgendaService } from '../agenda/previsao/previsao-da-agenda.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { TarefasSchedulerService } from './tarefas-scheduler.service';

/**
 * O equipamento que sai da posição (foi para o fabricante, para o conserto,
 * para outra planta) não tem o que manter onde estava: até o SN-88 o gerador
 * seguia criando a preventiva dele toda madrugada, e a agenda a prevendo
 * (achado do seed). O plano é do equipamento e fica: voltou para uma posição,
 * volta a vencer.
 *
 * Roda com `npx jest --runInBand src/modules/tarefas/equipamento-fora-da-posicao`.
 */
describe('equipamento fora da posição não gera preventiva (banco real)', () => {
  const prisma = new PrismaService();
  const escopoLivre = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const gerador = new TarefasSchedulerService(prisma, new ProgramacaoOSService(prisma, escopoLivre));
  const previsao = new PrevisaoDaAgendaService(prisma, new PermissionScopeService(prisma));
  const posicoes = new AtivosFuncionaisService(prisma);

  const ID = (s: string) => `testeforaposicao${s}`.padEnd(26, '0').slice(0, 26);
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  /** O componente da UC (a ventoinha do inversor), com tarefa própria */
  const UAR = ID('uar');
  const PREFIXO = 'TESTE-FORA-POSICAO';
  const br = (diaHora: string) => new Date(`${diaHora}-03:00`);
  const agora = br('2026-09-01T10:00:00');
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let categoriaId: string;
  let posicaoId: string;
  let tarefaId: string;
  let tarefaDoComponenteId: string;

  const programacoesDaTarefa = async (id = tarefaId) =>
    prisma.tarefas_programacao_os.count({ where: { tarefa_id: id } });
  const apagar = async () => {
    const tarefas = (await prisma.tarefas.findMany({ where: { tag: { startsWith: PREFIXO } }, select: { id: true } })).map((t) => t.id);
    const vinculos = await prisma.tarefas_programacao_os.findMany({ where: { tarefa_id: { in: tarefas } }, select: { programacao_id: true } });
    const ids = [...new Set(vinculos.map((v) => v.programacao_id))];
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: ids.map((i) => i.trim()) } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.ativos_funcionais_equipamentos.deleteMany({ where: { equipamento_id: UC } });
    await prisma.equipamentos.deleteMany({ where: { id: UAR } });
    await prisma.equipamentos.deleteMany({ where: { id: UC } });
    await prisma.ativos_funcionais.deleteMany({ where: { unidade_id: UNIDADE } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.categorias_equipamentos.deleteMany({ where: { nome: `${PREFIXO} categoria` } });
  };

  beforeAll(async () => {
    planta = await criarPlantaDeTeste(prisma, 'foraposicao', '84.500.000/0001-02');
    await apagar();
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: planta.id, nome: `${PREFIXO} usina`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    categoriaId = (await prisma.categorias_equipamentos.create({ data: { nome: `${PREFIXO} categoria` } })).id.trim();
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor que sai', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    posicaoId = (await posicoes.criar({ nome: `${PREFIXO} Inversor 07`, categoria_id: categoriaId, unidade_id: UNIDADE })).id.trim();
    await posicoes.instalar(posicaoId, UC);
    tarefaId = (
      await prisma.tarefas.create({
        data: { tag: `${PREFIXO}-1`, nome: 'Inspeção', criticidade: 3, ordem: 1, equipamento_id: UC, frequencia: 'MENSAL', data_ancora: br('2026-08-20T00:00:00') },
      })
    ).id.trim();
    await prisma.equipamentos.create({ data: { id: UAR, nome: 'Ventoinha do inversor', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC } });
    tarefaDoComponenteId = (
      await prisma.tarefas.create({
        data: { tag: `${PREFIXO}-2`, nome: 'Limpeza da ventoinha', criticidade: 3, ordem: 2, equipamento_id: UAR, frequencia: 'MENSAL', data_ancora: br('2026-08-20T00:00:00') },
      })
    ).id.trim();
  });

  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const naPrevisao = async (equipamentoId = UC, id = tarefaId) => {
    const { itens } = await previsao.prever({ inicio: br('2026-09-01T00:00:00'), fim: br('2026-09-30T23:59:59'), equipamentoId }, undefined, agora);
    return itens.filter((i) => i.tarefa_id === id).length;
  };

  it('fora da posição: o gerador não cria a preventiva e a agenda não a prevê', async () => {
    await posicoes.remover(posicaoId, { motivo: 'Enviado ao fabricante (garantia)' });

    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC, UAR] });

    expect(await programacoesDaTarefa()).toBe(0);
    expect(await naPrevisao()).toBe(0);
  });

  it('o componente da UC fora da posição também não (ele vai junto com ela)', async () => {
    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC, UAR] });

    expect(await programacoesDaTarefa(tarefaDoComponenteId)).toBe(0);
    expect(await naPrevisao(UAR, tarefaDoComponenteId)).toBe(0);
  });

  it('de volta a uma posição, a preventiva volta a sair (da UC e do componente)', async () => {
    await posicoes.instalar(posicaoId, UC);

    const { falhas } = await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC, UAR] });

    // Uma falha do grupo vem em `falhas`, não em erro: sem isto, o teste só diria "0"
    expect(falhas).toEqual([]);
    expect(await programacoesDaTarefa()).toBe(1);
    expect(await programacoesDaTarefa(tarefaDoComponenteId)).toBe(1);
    expect(await naPrevisao()).toBe(1);
    expect(await naPrevisao(UAR, tarefaDoComponenteId)).toBe(1);
  });
});

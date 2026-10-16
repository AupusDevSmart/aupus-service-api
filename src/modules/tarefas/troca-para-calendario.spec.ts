import { PermissionScopeService, PrismaService } from '@/core';
import { PrevisaoDaAgendaService } from '../agenda/previsao/previsao-da-agenda.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import { TarefasSchedulerService } from './tarefas-scheduler.service';
import { TarefasService } from './tarefas.service';

/**
 * A troca para a periodicidade por calendário (SN-54), contra Postgres real:
 * o gerador antes e depois de ligar não cria ciclo duplicado nem pula ciclo.
 * A programação aberta tem o ciclo gravado pela conta de dias; ligada a troca,
 * o ciclo calculado muda de data, e só pela data nova o gerador criaria outra
 * para o mesmo vencimento.
 */
describe('troca para a periodicidade por calendário (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const escopoLivre = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const gerador = new TarefasSchedulerService(prisma, new ProgramacaoOSService(prisma, escopoLivre));
  const previsao = new PrevisaoDaAgendaService(prisma, escopo);
  const tarefasService = new TarefasService(prisma, escopo, new PropagacaoPlanosService(prisma));

  const ID = (s: string) => `testetrocacal${s}`.padEnd(26, '0').slice(0, 26);
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const PREFIXO = 'TESTE-TROCACAL';
  const br = (diaHora: string) => new Date(`${diaHora}-03:00`);
  // Um "hoje" simulado: a âncora de 20/08 vence em 19/09 por dias e em 20/09 pelo calendário
  const agora = br('2026-09-01T10:00:00');
  const ANCORA = br('2026-08-20T00:00:00');
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const idsDasTarefas = async () => (await prisma.tarefas.findMany({ where: { tag: { startsWith: PREFIXO } }, select: { id: true } })).map((t) => t.id);
  const apagar = async () => {
    const vinculos = await prisma.tarefas_programacao_os.findMany({ where: { tarefa_id: { in: await idsDasTarefas() } }, select: { programacao_id: true } });
    const ids = [...new Set(vinculos.map((v) => v.programacao_id))];
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: ids.map((i) => i.trim()) } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: UC } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
  };
  const tarefa = (sufixo: string, ancora: Date = ANCORA) =>
    prisma.tarefas
      .create({ data: { tag: `${PREFIXO}-${sufixo}`, nome: `Tarefa ${sufixo}`, criticidade: 3, ordem: 1, equipamento_id: UC, frequencia: 'MENSAL', data_ancora: ancora } })
      .then((t) => t.id.trim());
  const ciclosDe = async (tarefaId: string) =>
    (await prisma.tarefas_programacao_os.findMany({ where: { tarefa_id: tarefaId }, select: { ciclo_referencia: true } })).map((v) => v.ciclo_referencia!.getTime());

  beforeAll(async () => {
    planta = await criarPlantaDeTeste(prisma, 'trocacal', '84.400.000/0001-01');
    await apagar();
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: planta.id, nome: `${PREFIXO} usina`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor troca', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
  });

  afterEach(() => {
    delete process.env.PERIODICIDADE_POR_CALENDARIO;
  });

  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await prisma.$disconnect();
  });

  it('a programação aberta antes da troca segura o ciclo depois dela: não duplica, e a previsão a mostra programada', async () => {
    const antiga = await tarefa('ANTIGA');

    // Antes da troca: o ciclo por dias fixos
    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC] });
    expect(await ciclosDe(antiga)).toEqual([br('2026-09-19T00:00:00').getTime()]);

    // Depois da troca: o ciclo calculado vira 20/09, mas o de 19/09 aberto é o mesmo ciclo
    process.env.PERIODICIDADE_POR_CALENDARIO = 'on';
    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC] });
    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC] });
    expect(await ciclosDe(antiga)).toEqual([br('2026-09-19T00:00:00').getTime()]);

    const { itens } = await previsao.prever({ inicio: br('2026-09-01T00:00:00'), fim: br('2026-09-30T23:59:59'), equipamentoId: UC }, undefined, agora);
    expect(itens.find((i) => i.tarefa_id === antiga)).toMatchObject({ situacao: 'programado', ciclo: br('2026-09-20T00:00:00') });
  });

  it('a tarefa sem nada aberto, já com a troca ligada, sai pelo calendário e não duplica', async () => {
    process.env.PERIODICIDADE_POR_CALENDARIO = 'on';
    const nova = await tarefa('NOVA');

    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC] });
    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC] });

    expect(await ciclosDe(nova)).toEqual([br('2026-09-20T00:00:00').getTime()]);
  });

  // O desfazer natural da variável: a aberta de 20/09 (calendário) tem de seguir
  // segurando o ciclo quando a conta volta a dar 19/09 (dias)
  it('desligar depois de ligar também não duplica', async () => {
    const nova = (await prisma.tarefas.findFirst({ where: { tag: `${PREFIXO}-NOVA` }, select: { id: true } }))!.id.trim();
    delete process.env.PERIODICIDADE_POR_CALENDARIO;

    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC] });

    expect(await ciclosDe(nova)).toEqual([br('2026-09-20T00:00:00').getTime()]);
  });

  // O salto aritmético até o período voltava ao dia 31; o passo a passo (o que o
  // gerador faz) prende no 28/02 e segue. O mesmo ciclo mudava de dia conforme a janela
  it('o dia 31 dá o mesmo ciclo numa janela larga e numa curta', async () => {
    process.env.PERIODICIDADE_POR_CALENDARIO = 'on';
    const outubro = br('2026-10-16T10:00:00');
    const trintaEUm = await tarefa('TRINTAEUM', br('2026-10-31T00:00:00'));
    const doJunho = (itens: { tarefa_id: string; ciclo: Date }[]) =>
      itens.filter((i) => i.tarefa_id === trintaEUm && i.ciclo.getTime() >= br('2027-06-01T00:00:00').getTime() && i.ciclo.getTime() <= br('2027-06-30T23:59:59').getTime()).map((i) => i.ciclo.toISOString());

    const larga = await previsao.prever({ inicio: br('2026-11-01T00:00:00'), fim: br('2027-07-31T23:59:59'), equipamentoId: UC }, undefined, outubro);
    const curta = await previsao.prever({ inicio: br('2027-06-01T00:00:00'), fim: br('2027-06-30T23:59:59'), equipamentoId: UC }, undefined, outubro);

    expect(doJunho(larga.itens)).toEqual([br('2027-06-28T00:00:00').toISOString()]);
    expect(doJunho(curta.itens)).toEqual(doJunho(larga.itens));
  });

  it('atrasada no GET /tarefas é só o que o gerador programa: a de template não vence', async () => {
    const template = await prisma.tarefas.create({
      data: { tag: `${PREFIXO}-TEMPLATE`, nome: 'Template', criticidade: 3, ordem: 1, frequencia: 'MENSAL', created_at: br('2025-01-01T00:00:00') },
    });

    const atrasadas = (await tarefasService.listar({ page: 1, limit: 100, search: PREFIXO, status_atrasada: true } as never)).data.map((t: { tag: string }) => t.tag);

    expect(atrasadas).not.toContain(`${PREFIXO}-TEMPLATE`);
    expect(atrasadas).toContain(`${PREFIXO}-ANTIGA`);
    await prisma.tarefas.delete({ where: { id: template.id } });
  });

  it('a previsão dos ciclos seguintes segue o calendário (o mesmo dia de cada mês)', async () => {
    process.env.PERIODICIDADE_POR_CALENDARIO = 'on';

    const { itens } = await previsao.prever({ inicio: br('2026-09-01T00:00:00'), fim: br('2027-01-31T23:59:59'), equipamentoId: UC }, undefined, agora);
    const daNova = itens.filter((i) => i.tarefa_tag === `${PREFIXO}-NOVA`).map((i) => i.ciclo.toISOString());

    expect(daNova).toEqual(
      ['2026-09-20', '2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20'].map((d) => br(`${d}T00:00:00`).toISOString()),
    );
  });
});

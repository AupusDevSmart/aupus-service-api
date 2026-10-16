import { BadRequestException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { ProgramacaoOSService } from '../../programacao-os/programacao-os.service';
import { TarefasSchedulerService } from '../../tarefas/tarefas-scheduler.service';
import { criarPlantaDeTeste } from '../../../../test/planta-de-teste';
import { PrevisaoDaAgendaController } from './previsao-da-agenda.controller';
import { PrevisaoDaAgendaService, type CicloPrevisto } from './previsao-da-agenda.service';

/**
 * A previsão da agenda (SN-51) tem de dizer o que o gerador de preventivas VAI
 * fazer: aqui as duas coisas rodam sobre as mesmas tarefas, no Postgres real, e
 * têm de concordar — inclusive num "hoje" simulado no futuro. O gerador roda
 * só sobre os equipamentos do teste (o banco de teste tem outras tarefas).
 */
describe('previsão da agenda x gerador (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const previsao = new PrevisaoDaAgendaService(prisma, escopo);
  const escopoLivre = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const gerador = new TarefasSchedulerService(prisma, new ProgramacaoOSService(prisma, escopoLivre));

  const DIA = 86_400_000;
  const ID = (s: string) => `testeprev${s}`.padEnd(26, '0').slice(0, 26);
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const UAR = ID('uar');
  const TECNICO_FORA = ID('tecnicofora');
  const PREFIXO = 'TESTE-PREV';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let outraPlanta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  // No segundo cheio: data_ancora é TIMESTAMP(0) e arredonda os milissegundos
  const agora = new Date(Math.floor(Date.now() / 1000) * 1000);
  const tarefas: Record<'atrasada' | 'anual' | 'programada' | 'componente', string> = { atrasada: '', anual: '', programada: '', componente: '' };
  let programacaoDoTeste = '';

  const apagarProgramacoes = async () => {
    const vinculos = await prisma.tarefas_programacao_os.findMany({
      where: { tarefa_id: { in: Object.values(tarefas).filter(Boolean) } },
      select: { programacao_id: true },
    });
    const ids = [...new Set([...vinculos.map((v) => v.programacao_id), ...(programacaoDoTeste ? [programacaoDoTeste] : [])])];
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: ids.map((i) => i.trim()) } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
  };

  const apagar = async () => {
    await apagarProgramacoes();
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR, UC] } } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_FORA } });
    await prisma.usuarios.deleteMany({ where: { id: TECNICO_FORA } });
  };

  const tarefa = (sufixo: string, equipamentoId: string, frequencia: string, ancora: Date) =>
    prisma.tarefas
      .create({ data: { tag: `${PREFIXO}-${sufixo}`, nome: `Tarefa ${sufixo}`, criticidade: 3, ordem: 1, equipamento_id: equipamentoId, frequencia: frequencia as never, data_ancora: ancora } })
      .then((t) => t.id.trim());

  beforeAll(async () => {
    planta = await criarPlantaDeTeste(prisma, 'previsao', '83.200.000/0001-01');
    outraPlanta = await criarPlantaDeTeste(prisma, 'previsaooutra', '83.200.000/0001-02');
    await apagar();
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: planta.id, nome: 'TESTE-PREV usina', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor PREV', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    await prisma.equipamentos.create({ data: { id: UAR, nome: 'Ventoinha PREV', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC } });

    tarefas.atrasada = await tarefa('ATRASADA', UC, 'MENSAL', new Date(agora.getTime() - 40 * DIA)); // venceu há 10 dias
    tarefas.anual = await tarefa('ANUAL', UC, 'ANUAL', new Date(agora.getTime() - 5 * DIA)); // vence em 360 dias
    tarefas.programada = await tarefa('PROGRAMADA', UC, 'SEMANAL', new Date(agora.getTime() - 3 * DIA)); // vence em 4 dias, já programada
    tarefas.componente = await tarefa('UAR', UAR, 'TRIMESTRAL', agora); // vence em 90 dias, no componente

    // O ciclo da semanal já tem programação aberta: o gerador não cria outra
    const prog = await prisma.programacoes_os.create({
      data: {
        codigo: `${PREFIXO}-ABERTA`, descricao: `${PREFIXO} aberta`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', origem: 'TAREFA',
        tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(),
      },
    });
    programacaoDoTeste = prog.id;
    await prisma.tarefas_programacao_os.create({
      data: { programacao_id: prog.id, tarefa_id: tarefas.programada, ordem: 1, status: 'PENDENTE', ciclo_referencia: new Date(agora.getTime() + 4 * DIA) },
    });

    await prisma.usuarios.create({ data: { id: TECNICO_FORA, nome: 'Técnico de fora', email: `${TECNICO_FORA}@prev.teste`, status: 'Ativo', is_active: true } });
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_FORA, planta_id: outraPlanta.id } });
  });

  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await outraPlanta.apagar();
    await prisma.$disconnect();
  });

  const periodo = (desde: Date, dias: number) => ({ inicio: new Date(desde.getTime() - 30 * DIA), fim: new Date(desde.getTime() + dias * DIA) });
  const primeiroDe = (itens: CicloPrevisto[], tarefaId: string) => itens.find((i) => i.tarefa_id === tarefaId);

  it('diz a situação de cada ciclo: atrasado, programado (com o item) e previsto (com a data da geração)', async () => {
    const { itens } = await previsao.prever(periodo(agora, 365), undefined, agora);

    expect(primeiroDe(itens, tarefas.atrasada)).toMatchObject({ situacao: 'atrasado', ciclo: new Date(agora.getTime() - 10 * DIA) });
    expect(primeiroDe(itens, tarefas.programada)).toMatchObject({ situacao: 'programado', programacao_id: programacaoDoTeste.trim(), status_do_item: 'PENDENTE' });
    expect(primeiroDe(itens, tarefas.anual)).toMatchObject({
      situacao: 'previsto',
      ciclo: new Date(agora.getTime() + 360 * DIA),
      programacao_a_partir_de: new Date(agora.getTime() + 300 * DIA),
    });
    // Os ciclos seguintes supõem o anterior feito no dia: a mensal aparece todo mês
    const mensal = itens.filter((i) => i.tarefa_id === tarefas.atrasada);
    expect(mensal.length).toBeGreaterThanOrEqual(12);
    expect(mensal.slice(1).every((i) => i.situacao === 'previsto')).toBe(true);
    // A data programada é dia útil: nunca antes do ciclo
    expect(itens.every((i) => i.data_programada.getTime() >= i.ciclo.getTime())).toBe(true);
  });

  it('o gerador cria exatamente o que a previsão disse que sairia agora, com o mesmo ciclo', async () => {
    const antes = await previsao.prever(periodo(agora, 120), undefined, agora);
    const devemSair = new Map(
      [tarefas.atrasada, tarefas.anual, tarefas.programada, tarefas.componente]
        .map((id) => primeiroDe(antes.itens, id))
        .filter((i): i is CicloPrevisto => !!i && i.situacao !== 'programado' && i.programacao_a_partir_de!.getTime() <= agora.getTime())
        .map((i) => [i.tarefa_id, i.ciclo.getTime()]),
    );
    expect([...devemSair.keys()]).toEqual([tarefas.atrasada]);

    await gerador.gerarProgramacoesAutomaticas({ agora, equipamentoIds: [UC, UAR] });

    const novos = await prisma.tarefas_programacao_os.findMany({
      where: { tarefa_id: { in: Object.values(tarefas) }, programacao_id: { not: programacaoDoTeste } },
      select: { tarefa_id: true, ciclo_referencia: true, programacao_id: true },
    });
    expect(new Map(novos.map((v) => [v.tarefa_id!.trim(), v.ciclo_referencia!.getTime()]))).toEqual(devemSair);

    // E a previsão passa a mostrar o ciclo como programado, com a programação nova
    const depois = await previsao.prever(periodo(agora, 120), undefined, agora);
    expect(primeiroDe(depois.itens, tarefas.atrasada)).toMatchObject({ situacao: 'programado', programacao_id: novos[0].programacao_id.trim() });
  });

  it('num hoje simulado no futuro, também concordam: o componente entra quando faltam 60 dias', async () => {
    const componente = primeiroDe((await previsao.prever(periodo(agora, 120), undefined, agora)).itens, tarefas.componente)!;
    const dia = new Date(componente.programacao_a_partir_de!.getTime() + 60_000);

    const naqueleDia = primeiroDe((await previsao.prever(periodo(dia, 120), undefined, dia)).itens, tarefas.componente)!;
    expect(naqueleDia.programacao_a_partir_de!.getTime()).toBeLessThanOrEqual(dia.getTime());

    await gerador.gerarProgramacoesAutomaticas({ agora: dia, equipamentoIds: [UC, UAR] });

    const doComponente = await prisma.tarefas_programacao_os.findMany({ where: { tarefa_id: tarefas.componente }, select: { ciclo_referencia: true } });
    expect(doComponente.map((v) => v.ciclo_referencia!.getTime())).toEqual([componente.ciclo.getTime()]);
    // A anual ainda não: faltam mais de 60 dias
    expect(await prisma.tarefas_programacao_os.count({ where: { tarefa_id: tarefas.anual } })).toBe(0);
  });

  describe('filtros e escopo', () => {
    it('o equipamento inclui as tarefas dos componentes dele', async () => {
      const { itens } = await previsao.prever({ ...periodo(agora, 120), equipamentoId: UC }, undefined, agora);

      expect(new Set(itens.map((i) => i.tarefa_id))).toContain(tarefas.componente);
    });

    it('o técnico de outra planta não vê nada; com a planta dele no filtro, também nada', async () => {
      const deFora = { id: TECNICO_FORA, role: 'operador' };

      expect((await previsao.prever(periodo(agora, 120), deFora, agora)).itens.filter((i) => i.planta_id === planta.id)).toEqual([]);
      expect((await previsao.prever({ ...periodo(agora, 120), plantaId: planta.id }, deFora, agora)).itens).toEqual([]);
    });

    it('filtro de outra planta não traz as tarefas desta', async () => {
      const { itens } = await previsao.prever({ ...periodo(agora, 120), plantaId: outraPlanta.id }, undefined, agora);

      expect(itens.filter((i) => Object.values(tarefas).includes(i.tarefa_id))).toEqual([]);
    });
  });

  describe('período', () => {
    const controller = new PrevisaoDaAgendaController(previsao);

    it('fim antes do início e mais de 400 dias são recusados', () => {
      expect(() => controller.prever({ inicio: '2026-11-10', fim: '2026-11-01' })).toThrow(BadRequestException);
      expect(() => controller.prever({ inicio: '2026-01-01', fim: '2027-03-01' })).toThrow(BadRequestException);
    });
  });
});

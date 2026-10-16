import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PermissionScopeService, PrismaService } from '@/core';
import { OSFiltersDto } from '../../modules/execucao-os/dto/os-filters.dto';
import { ProgramacaoFiltersDto } from '../../modules/programacao-os/dto/programacao-filters.dto';
import { ExecucaoOSService } from '../../modules/execucao-os/execucao-os.service';
import { ProgramacaoOSService } from '../../modules/programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';

/**
 * Os filtros de período, planta e equipamento das listas de Programação e
 * Execução (SN-55), contra Postgres real. O equipamento da OS quase nunca vem
 * na coluna: está na tarefa congelada, na anomalia ou na solicitação de origem,
 * e o filtro tem de achar por todos — o UC levando os componentes dele.
 */
describe('filtros das listas de programação e execução (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const programacoes = new ProgramacaoOSService(prisma, escopo);
  const execucoes = new ExecucaoOSService(prisma, escopo);

  // 25 caracteres, como os cuid antigos: o filtro tem de casar com o Char(26)
  const ID = (s: string) => `testefiltros${s}`.padEnd(25, '0').slice(0, 25);
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const UAR = ID('uar');
  const OUTRO = ID('outro');
  const TECNICO_FORA = ID('tecnicofora');
  const PREFIXO = 'TESTE-FILTROS';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let outraPlanta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  const p: Record<string, string> = {};
  const os: Record<string, string> = {};

  // Dias em Brasília (-03:00)
  const dia = (d: string, hora = '10:00') => new Date(`${d}T${hora}:00.000-03:00`);

  const apagar = async () => {
    const progs = await prisma.programacoes_os.findMany({ where: { codigo: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = progs.map((x) => x.id);
    const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: oss.map((o) => o.id) } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss.map((o) => o.id) } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { titulo: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: UAR } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC, OUTRO] } } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_FORA } });
    await prisma.usuarios.deleteMany({ where: { id: TECNICO_FORA } });
  };

  const programacao = async (sufixo: string, dados: Record<string, unknown>) =>
    (
      await prisma.programacoes_os.create({
        data: {
          codigo: `${PREFIXO}-${sufixo}`, descricao: `${PREFIXO} ${sufixo}`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA', origem: 'MANUAL',
          tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, atualizado_em: new Date(), ...dados,
        },
      })
    ).id;
  const ordem = async (programacaoId: string, sufixo: string, dados: Record<string, unknown>) =>
    (
      await prisma.ordens_servico.create({
        data: {
          programacao_id: programacaoId, numero_os: `${PREFIXO}-${sufixo}`, descricao: `OS ${sufixo}`, condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA',
          prioridade: 'MEDIA', origem: 'MANUAL', tempo_estimado: 1, duracao_estimada: 1, planta_id: planta.id, status: 'PENDENTE', atualizado_em: new Date(), ...dados,
        },
      })
    ).id;

  beforeAll(async () => {
    planta = await criarPlantaDeTeste(prisma, 'filtros', '84.200.000/0001-01');
    outraPlanta = await criarPlantaDeTeste(prisma, 'filtrosoutra', '84.200.000/0001-02');
    await apagar();
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: planta.id, nome: `${PREFIXO} usina`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor filtros', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
    await prisma.equipamentos.create({ data: { id: UAR, nome: 'Ventoinha filtros', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC } });
    await prisma.equipamentos.create({ data: { id: OUTRO, nome: 'Outro filtros', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });

    // Pela tarefa congelada no componente, com a data do gerador
    p.tarefa = await programacao('TAREFA', { origem: 'TAREFA', data_hora_programada: dia('2026-11-10') });
    await prisma.tarefas_programacao_os.create({ data: { programacao_id: p.tarefa, ordem: 1, status: 'PENDENTE', equipamento_id: UAR, nome_snapshot: 'x' } });
    os.tarefa = await ordem(p.tarefa, 'TAREFA', { data_hora_programada: dia('2026-11-10', '23:30') });
    await prisma.tarefas_os.create({ data: { os_id: os.tarefa, ordem: 1, status: 'PENDENTE', equipamento_id: UAR, nome_snapshot: 'x' } });

    // Pela anomalia, com a data do formulário (sem a hora do gerador)
    const anomalia = await prisma.anomalias.create({
      data: { descricao: `${PREFIXO} anomalia`, local: 'x', ativo: 'x', origem: 'OPERADOR', planta_id: planta.id, equipamento_id: UC },
    });
    p.anomalia = await programacao('ANOMALIA', { origem: 'ANOMALIA', anomalia_id: anomalia.id, data_previsao_inicio: dia('2026-11-12') });
    os.anomalia = await ordem(p.anomalia, 'ANOMALIA', { anomalia_id: anomalia.id, data_hora_programada: dia('2026-11-12') });

    // Pela solicitação de origem
    const solicitacao = await prisma.solicitacoes_servico.create({
      data: {
        numero: `${PREFIXO}-SOL-${Date.now()}`, titulo: `${PREFIXO} solicitação`, descricao: 'x', tipo: 'MANUTENCAO_CORRETIVA', planta_id: planta.id,
        solicitante_nome: 'Teste', local: 'x', equipamento_id: UC,
      },
    });
    p.solicitacao = await programacao('SOLICITACAO', { origem: 'SOLICITACAO_SERVICO', solicitacao_servico_id: solicitacao.id, data_previsao_inicio: dia('2026-11-20') });
    os.solicitacao = await ordem(p.solicitacao, 'SOLICITACAO', { data_hora_programada: dia('2026-11-20') });

    // De outro equipamento, na mesma planta
    p.outro = await programacao('OUTRO', { equipamento_id: OUTRO, data_hora_programada: dia('2026-11-10') });
    os.outro = await ordem(p.outro, 'OUTRO', { equipamento_id: OUTRO, data_hora_programada: dia('2026-11-10') });

    await prisma.usuarios.create({ data: { id: TECNICO_FORA, nome: 'Técnico de fora', email: `${TECNICO_FORA}@filtros.teste`, status: 'Ativo', is_active: true } });
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_FORA, planta_id: outraPlanta.id } });
  });

  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await outraPlanta.apagar();
    await prisma.$disconnect();
  });

  const codigosDaProgramacao = async (filtros: Record<string, unknown>, user?: { id: string; role: string }) =>
    (await programacoes.listar({ page: 1, limit: 100, search: PREFIXO, ...filtros } as never, user)).data.map((x) => x.codigo).sort();
  const numerosDaOS = async (filtros: Record<string, unknown>, user?: { id: string; role: string }) =>
    (await execucoes.listar({ page: 1, limit: 100, search: PREFIXO, ...filtros } as never, user)).data.map((x) => x.numero_os).sort();

  describe('equipamento', () => {
    it('programação: o UC acha pela tarefa do componente, pela anomalia e pela solicitação; o outro equipamento fica de fora', async () => {
      expect(await codigosDaProgramacao({ equipamento_id: UC })).toEqual([`${PREFIXO}-ANOMALIA`, `${PREFIXO}-SOLICITACAO`, `${PREFIXO}-TAREFA`]);
      expect(await codigosDaProgramacao({ equipamento_id: UAR })).toEqual([`${PREFIXO}-TAREFA`]);
      expect(await codigosDaProgramacao({ equipamento_id: OUTRO })).toEqual([`${PREFIXO}-OUTRO`]);
    });

    it('OS: a mesma regra (a solicitação vem pela programação)', async () => {
      expect(await numerosDaOS({ equipamento_id: UC })).toEqual([`${PREFIXO}-ANOMALIA`, `${PREFIXO}-SOLICITACAO`, `${PREFIXO}-TAREFA`]);
      expect(await numerosDaOS({ equipamento_id: OUTRO })).toEqual([`${PREFIXO}-OUTRO`]);
    });

    it('equipamento que não existe não traz nada (e não vira "sem filtro")', async () => {
      expect(await codigosDaProgramacao({ equipamento_id: ID('naoexiste') })).toEqual([]);
      expect(await numerosDaOS({ equipamento_id: ID('naoexiste') })).toEqual([]);
    });
  });

  describe('período', () => {
    it('programação pela data dela: a do gerador ou, sem ela, a do formulário (não mais a da criação)', async () => {
      expect(await codigosDaProgramacao({ data_inicio: '2026-11-10', data_fim: '2026-11-10' })).toEqual([`${PREFIXO}-OUTRO`, `${PREFIXO}-TAREFA`]);
      expect(await codigosDaProgramacao({ data_inicio: '2026-11-11', data_fim: '2026-11-15' })).toEqual([`${PREFIXO}-ANOMALIA`]);
    });

    it('OS: o último dia vai até o fim do dia em Brasília (a de 23:30 entrava fora)', async () => {
      expect(await numerosDaOS({ data_inicio: '2026-11-10', data_fim: '2026-11-10' })).toEqual([`${PREFIXO}-OUTRO`, `${PREFIXO}-TAREFA`]);
    });

    it('período invertido é recusado, como no calendário (antes voltava vazio, calado)', async () => {
      await expect(codigosDaProgramacao({ data_inicio: '2026-11-20', data_fim: '2026-11-10' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(numerosDaOS({ data_inicio: '2026-11-20', data_fim: '2026-11-10' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('período e equipamento juntos (dois OR que não se apagam)', async () => {
      expect(await codigosDaProgramacao({ data_inicio: '2026-11-01', data_fim: '2026-11-30', equipamento_id: UC })).toEqual([
        `${PREFIXO}-ANOMALIA`,
        `${PREFIXO}-SOLICITACAO`,
        `${PREFIXO}-TAREFA`,
      ]);
      expect(await numerosDaOS({ data_inicio: '2026-11-11', data_fim: '2026-11-30', equipamento_id: UC })).toEqual([`${PREFIXO}-ANOMALIA`, `${PREFIXO}-SOLICITACAO`]);
    });
  });

  describe('planta e escopo', () => {
    it('a planta do filtro traz o que é dela, e só', async () => {
      expect(await codigosDaProgramacao({ planta_id: planta.id.trim() })).toHaveLength(4);
      expect(await numerosDaOS({ planta_id: planta.id.trim() })).toHaveLength(4);
      expect(await codigosDaProgramacao({ planta_id: outraPlanta.id.trim() })).toEqual([]);
    });

    // O escopo já aceitava a planta pelo equipamento; o filtro só pela coluna, e a
    // OS antiga sem planta (SN-33) aparecia em "todas" e sumia ao escolher a dela
    it('o registro sem planta, com o equipamento na planta, entra no filtro dela (a mesma regra do escopo)', async () => {
      const semPlanta = await programacao('SEMPLANTA', { planta_id: null, equipamento_id: OUTRO, data_hora_programada: dia('2026-11-25') });
      const osSemPlanta = await ordem(semPlanta, 'SEMPLANTA', { planta_id: null, equipamento_id: OUTRO, data_hora_programada: dia('2026-11-25') });
      try {
        expect(await codigosDaProgramacao({ planta_id: planta.id.trim() })).toContain(`${PREFIXO}-SEMPLANTA`);
        expect(await numerosDaOS({ planta_id: planta.id.trim() })).toContain(`${PREFIXO}-SEMPLANTA`);
        expect(await codigosDaProgramacao({ planta_id: outraPlanta.id.trim() })).toEqual([]);
      } finally {
        await prisma.ordens_servico.delete({ where: { id: osSemPlanta } });
        await prisma.programacoes_os.delete({ where: { id: semPlanta } });
      }
    });

    it('a lista por instalação acha pela regra da instalação (só pela coluna, achava uma de quatro)', async () => {
      const r = await programacoes.buscarPorUnidade(UNIDADE, { page: 1, limit: 100, search: PREFIXO } as never);

      expect(r.data.map((x) => x.codigo).sort()).toEqual([`${PREFIXO}-ANOMALIA`, `${PREFIXO}-OUTRO`, `${PREFIXO}-SOLICITACAO`, `${PREFIXO}-TAREFA`]);
    });

    // O @Length(26, 26) recusava o cuid de 25 caracteres com 400 antes de chegar ao service
    it('os DTOs aceitam o id de 25 caracteres e põem teto no limit', async () => {
      const erros = async (Classe: new () => object, dados: Record<string, unknown>) =>
        (await validate(plainToInstance(Classe, dados))).map((e) => e.property);
      const vinteECinco = 'c'.repeat(25);

      for (const Classe of [OSFiltersDto, ProgramacaoFiltersDto]) {
        expect(await erros(Classe, { planta_id: vinteECinco, equipamento_id: vinteECinco })).toEqual([]);
        expect(await erros(Classe, { limit: '101' })).toEqual(['limit']);
        expect(await erros(Classe, { limit: '100' })).toEqual([]);
      }
    });

    it('o técnico de outra planta não vê nada desta, nem pedindo a planta ou o equipamento dela', async () => {
      const deFora = { id: TECNICO_FORA, role: 'operador' };

      expect(await codigosDaProgramacao({ planta_id: planta.id.trim() }, deFora)).toEqual([]);
      expect(await codigosDaProgramacao({ equipamento_id: UC }, deFora)).toEqual([]);
      expect(await numerosDaOS({ planta_id: planta.id.trim() }, deFora)).toEqual([]);
      expect(await numerosDaOS({ equipamento_id: UC }, deFora)).toEqual([]);
    });
  });
});

import { ConflictException } from '@nestjs/common';
import { PrismaService, PermissionScopeService } from '@/core';
import { ExecucaoOSService } from '../execucao-os/execucao-os.service';
import { ProgramacaoOSService } from './programacao-os.service';

/**
 * O status da origem (anomalia, solicitacao) acompanha a programacao e a OS,
 * contra Postgres de verdade.
 *
 * A lista de origem da tela so oferece o que esta REGISTRADA. Entao todo
 * caminho que encerra uma programacao sem resolver o problema precisa devolver
 * a origem para REGISTRADA — senao ela some da lista e nunca mais pode ser
 * programada. E todo caminho que abre uma programacao precisa tira-la de la,
 * senao a mesma anomalia ganha duas OS.
 *
 * Os ids da anomalia sao gerados pelo `cuid()` do Prisma (25 caracteres numa
 * coluna `Char(26)`, com o espaco no fim), como em producao.
 *
 * Roda com `npx jest --runInBand src/modules/programacao-os/status-da-origem`.
 */
describe('status da origem acompanha programacao e OS (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);

  const ID_PROPRIETARIO = 'TESTEORIGPROPRIETARIO00001';
  const ID_PLANTA = 'TESTEORIGPLANTA00000000001';
  const PREFIXO = 'TESTE-STATUS-ORIGEM';

  const novaAnomalia = async (sufixo: string) => {
    const criada = await prisma.anomalias.create({
      data: {
        descricao: `${PREFIXO} ${sufixo}`,
        local: 'Local de teste',
        ativo: 'Ativo de teste',
        origem: 'OPERADOR',
        planta_id: ID_PLANTA,
      },
    });
    return criada.id.trim();
  };

  const novaSolicitacao = async (sufixo: string) => {
    const criada = await prisma.solicitacoes_servico.create({
      data: {
        numero: `${PREFIXO}-${sufixo}-${Date.now()}`,
        titulo: `${PREFIXO} ${sufixo}`,
        descricao: 'Solicitacao de teste',
        tipo: 'MANUTENCAO_CORRETIVA',
        planta_id: ID_PLANTA,
        solicitante_nome: 'Teste',
        local: 'Local de teste',
      },
    });
    return criada.id.trim();
  };

  const programarAnomalia = (anomaliaId: string) =>
    programacoes.criar({
      descricao: `${PREFIXO} programacao`,
      condicoes: 'FUNCIONANDO',
      tipo: 'CORRETIVA',
      prioridade: 'MEDIA',
      origem: 'ANOMALIA',
      anomalia_id: anomaliaId,
      planta_id: ID_PLANTA,
      dados_origem: { tipo: 'ANOMALIA', anomaliaId },
    } as never);

  const statusAnomalia = async (id: string) =>
    (await prisma.anomalias.findUnique({ where: { id } }))?.status;

  const osDaProgramacao = (programacaoId: string) =>
    prisma.ordens_servico.findUnique({ where: { programacao_id: programacaoId } });

  const limpar = async () => {
    const progs = await prisma.programacoes_os.findMany({
      where: { descricao: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const ids = progs.map((p) => p.id);
    const oss = await prisma.ordens_servico.findMany({
      where: { programacao_id: { in: ids } },
      select: { id: true },
    });
    const osIds = oss.map((o) => o.id);
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.checklist_atividades_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.solicitacoes_servico.updateMany({
      where: { titulo: { startsWith: PREFIXO } },
      data: { programacao_os_id: null },
    });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
    await prisma.historico_anomalias.deleteMany({
      where: { anomalia: { descricao: { startsWith: PREFIXO } } },
    });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.historico_solicitacao_servico.deleteMany({
      where: { solicitacao: { titulo: { startsWith: PREFIXO } } },
    });
    await prisma.solicitacoes_servico.deleteMany({ where: { titulo: { startsWith: PREFIXO } } });
  };

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: ID_PROPRIETARIO },
      update: {},
      create: {
        id: ID_PROPRIETARIO,
        nome: 'Proprietario de teste (status da origem)',
        email: 'teste-status-origem@aupus.local',
        senha: 'x',
      },
    });
    await prisma.plantas.upsert({
      where: { id: ID_PLANTA },
      update: {},
      create: {
        id: ID_PLANTA,
        nome: 'Planta de teste (status da origem)',
        cnpj: '00000000000517',
        proprietario_id: ID_PROPRIETARIO,
        horario_funcionamento: '08:00-18:00',
        localizacao: 'Teste',
        logradouro: 'Rua de teste, 1',
        cidade: 'Goiania',
        uf: 'GO',
        cep: '74000000',
      },
    });
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  describe('anomalia', () => {
    it('criar programa a anomalia, e cancelar a programacao pendente devolve para REGISTRADA', async () => {
      const anomaliaId = await novaAnomalia('cancelar-pendente');
      const prog = await programarAnomalia(anomaliaId);
      expect(await statusAnomalia(anomaliaId)).toBe('PROGRAMADA');

      await programacoes.cancelar(prog.id, { motivo_cancelamento: 'teste' });

      expect(await statusAnomalia(anomaliaId)).toBe('REGISTRADA');
      // E volta a poder ser programada
      await expect(programarAnomalia(anomaliaId)).resolves.toBeDefined();
    });

    it('cancelar a programacao aprovada cancela tambem a OS gerada e devolve a anomalia', async () => {
      const anomaliaId = await novaAnomalia('cancelar-aprovada');
      const prog = await programarAnomalia(anomaliaId);
      await programacoes.aprovar(prog.id, {});
      expect((await osDaProgramacao(prog.id))?.status).toBe('PENDENTE');

      await programacoes.cancelar(prog.id, { motivo_cancelamento: 'teste' });

      expect((await osDaProgramacao(prog.id))?.status).toBe('CANCELADA');
      expect(await statusAnomalia(anomaliaId)).toBe('REGISTRADA');
    });

    it('cancelar a OS cancela a programacao e devolve a anomalia', async () => {
      const anomaliaId = await novaAnomalia('cancelar-os');
      const prog = await programarAnomalia(anomaliaId);
      await programacoes.aprovar(prog.id, {});
      const os = await osDaProgramacao(prog.id);

      await execucoes.cancelar(os!.id, { motivo_cancelamento: 'teste' } as never);

      const progDepois = await prisma.programacoes_os.findUnique({ where: { id: prog.id } });
      expect(progDepois?.status).toBe('CANCELADA');
      expect(await statusAnomalia(anomaliaId)).toBe('REGISTRADA');
      await expect(programarAnomalia(anomaliaId)).resolves.toBeDefined();
    });

    it('excluir a programacao pendente devolve a anomalia', async () => {
      const anomaliaId = await novaAnomalia('excluir');
      const prog = await programarAnomalia(anomaliaId);

      await programacoes.deletar(prog.id);

      expect(await statusAnomalia(anomaliaId)).toBe('REGISTRADA');
    });

    it('nao deixa programar uma anomalia que ja tem programacao em aberto', async () => {
      const anomaliaId = await novaAnomalia('duplicada');
      await programarAnomalia(anomaliaId);

      await expect(programarAnomalia(anomaliaId)).rejects.toBeInstanceOf(ConflictException);
      await expect(
        programacoes.criarDeAnomalia(anomaliaId, {} as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('trocar a anomalia na edicao solta a antiga e programa a nova', async () => {
      const antiga = await novaAnomalia('troca-antiga');
      const nova = await novaAnomalia('troca-nova');
      const prog = await programarAnomalia(antiga);

      await programacoes.atualizar(prog.id, {
        anomalia_id: nova,
        dados_origem: { tipo: 'ANOMALIA', anomaliaId: nova },
      } as never);

      expect(await statusAnomalia(antiga)).toBe('REGISTRADA');
      expect(await statusAnomalia(nova)).toBe('PROGRAMADA');
    });

    it('finalizar a OS finaliza a anomalia e a programacao', async () => {
      const anomaliaId = await novaAnomalia('finalizar');
      const prog = await programarAnomalia(anomaliaId);
      await programacoes.aprovar(prog.id, {});
      const os = await osDaProgramacao(prog.id);
      await prisma.ordens_servico.update({ where: { id: os!.id }, data: { status: 'AUDITADA' } });

      await execucoes.finalizar(os!.id, {} as never);

      expect(await statusAnomalia(anomaliaId)).toBe('FINALIZADA');
      const progDepois = await prisma.programacoes_os.findUnique({ where: { id: prog.id } });
      expect(progDepois?.status).toBe('FINALIZADA');
    });

    it('registra cada mudanca de status no historico da anomalia', async () => {
      const anomaliaId = await novaAnomalia('historico');
      const prog = await programarAnomalia(anomaliaId);
      await programacoes.cancelar(prog.id, { motivo_cancelamento: 'teste' });

      const historico = await prisma.historico_anomalias.findMany({
        where: { anomalia_id: anomaliaId, status_novo: { not: null } },
        orderBy: { created_at: 'asc' },
      });
      expect(historico.map((h) => h.status_novo)).toEqual(['PROGRAMADA', 'REGISTRADA']);
    });
  });

  describe('solicitacao de servico', () => {
    const programarSolicitacao = (solicitacaoId: string) =>
      programacoes.criar({
        descricao: `${PREFIXO} programacao`,
        condicoes: 'FUNCIONANDO',
        tipo: 'CORRETIVA',
        prioridade: 'MEDIA',
        origem: 'SOLICITACAO_SERVICO',
        planta_id: ID_PLANTA,
        dados_origem: { tipo: 'SOLICITACAO_SERVICO', solicitacaoServicoId: solicitacaoId },
      } as never);

    const solicitacao = (id: string) => prisma.solicitacoes_servico.findUnique({ where: { id } });

    it('criar pelo formulario programa a solicitacao, e cancelar devolve para REGISTRADA', async () => {
      const solId = await novaSolicitacao('cancelar');
      const prog = await programarSolicitacao(solId);

      let sol = await solicitacao(solId);
      expect(sol?.status).toBe('PROGRAMADA');
      expect(sol?.programacao_os_id?.trim()).toBe(prog.id.trim());

      await programacoes.cancelar(prog.id, { motivo_cancelamento: 'teste' });

      sol = await solicitacao(solId);
      expect(sol?.status).toBe('REGISTRADA');
      expect(sol?.programacao_os_id).toBeNull();
    });

    it('nao deixa programar uma solicitacao que ja tem programacao em aberto', async () => {
      const solId = await novaSolicitacao('duplicada');
      await programarSolicitacao(solId);

      await expect(programarSolicitacao(solId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancelar a OS devolve a solicitacao', async () => {
      const solId = await novaSolicitacao('cancelar-os');
      const prog = await programarSolicitacao(solId);
      await programacoes.aprovar(prog.id, {});
      const os = await osDaProgramacao(prog.id);

      await execucoes.cancelar(os!.id, { motivo_cancelamento: 'teste' } as never);

      const sol = await solicitacao(solId);
      expect(sol?.status).toBe('REGISTRADA');
      expect(sol?.programacao_os_id).toBeNull();
    });
  });
});

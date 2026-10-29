import 'reflect-metadata';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { CondicaoOS, OrigemOS, PermissionScopeService, PrioridadeOS, PrismaService, TipoOS } from '@/core';
import { ProgramacaoOSController } from './programacao-os.controller';
import { ProgramacaoOSService } from './programacao-os.service';
import { AjustesDaProgramacaoDaSolicitacaoDto } from './dto';

/**
 * Programação: o que ficou fora do escopo e da regra "uma programação = uma
 * planta" (SN-40).
 *
 * - Tarefas (adicionar, editar, remover) e excluir buscavam a programação sem
 *   o usuário: não conferiam o escopo.
 * - Adicionar tarefas não recalculava a planta: entrava tarefa de outra planta.
 * - `from-solicitacao` recebia `Partial<CreateProgramacaoDto>` — tipo sem
 *   classe, que o ValidationPipe não valida — e o `...dto` sobrescrevia
 *   qualquer campo, inclusive a solicitação.
 * - As estatísticas da listagem contavam as programações de todas as plantas.
 *
 * Contra Postgres real.
 */
describe('programação no escopo da planta (banco real)', () => {
  const prisma = new PrismaService();
  const programacoes = new ProgramacaoOSService(prisma, new PermissionScopeService(prisma));

  // 25 caracteres, como os ids cuid antigos, para provar o trim nas junções
  const ID = (s: string) => `testeprogescopo${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UNIDADE_B = ID('unidadeb');
  const UC_A = ID('uca');
  const UAR_A = ID('uara');
  const UC_B = ID('ucb');
  const PREFIXO = 'TESTE-PROG-ESCOPO';

  const clienteA = { id: DONO_A, role: 'proprietario' };
  const tecnicoB = { id: TECNICO_B, role: 'operador' };
  const tarefa: Record<'a1' | 'uar' | 'b', string> = { a1: '', uar: '', b: '' };

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.solicitacoes_servico.updateMany({ where: { titulo: { startsWith: PREFIXO } }, data: { programacao_os_id: null } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
    await prisma.historico_solicitacao_servico.deleteMany({ where: { solicitacao: { titulo: { startsWith: PREFIXO } } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { titulo: { startsWith: PREFIXO } } });
  };

  const apagarFixos = async () => {
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: UAR_A } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC_A, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });
  const unidade = (id: string, plantaId: string) =>
    prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `${PREFIXO} ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });

  beforeAll(async () => {
    await limpar();
    await apagarFixos();
    for (const id of [DONO_A, DONO_B, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@prog-escopo.teste` } });
    await planta(PLANTA_A, DONO_A, '88.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '88.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    // Componente (UAR) não tem unidade: a planta vem do UC pai
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha A', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });
    for (const [lado, equipamento] of [['a1', UC_A], ['uar', UAR_A], ['b', UC_B]] as const) {
      tarefa[lado] = (await prisma.tarefas.create({ data: { tag: `${PREFIXO}-${lado}`, nome: lado, criticidade: 3, ordem: 1, equipamento_id: equipamento } })).id;
    }
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await apagarFixos();
    await prisma.$disconnect();
  });

  /** Programação da planta A com a tarefa A1. */
  const programacaoA = () =>
    programacoes.criar({
      descricao: `${PREFIXO} preventiva A`,
      condicoes: CondicaoOS.FUNCIONANDO,
      tipo: TipoOS.PREVENTIVA,
      prioridade: PrioridadeOS.MEDIA,
      origem: OrigemOS.TAREFA,
      tarefas_ids: [tarefa.a1],
    } as never);

  const tarefasDa = async (programacaoId: string) =>
    (await prisma.tarefas_programacao_os.findMany({ where: { programacao_id: programacaoId }, select: { tarefa_id: true } }))
      .map((v) => v.tarefa_id?.trim())
      .sort();

  describe('adicionar tarefas: uma programação, uma planta', () => {
    it('tarefa de outra planta é recusada e nada entra', async () => {
      const prog = await programacaoA();
      await expect(programacoes.adicionarTarefasProgramacao(prog.id, { tarefas_ids: [tarefa.b] })).rejects.toThrow(BadRequestException);
      expect(await tarefasDa(prog.id)).toEqual([tarefa.a1.trim()]);
    });

    it('tarefa da mesma planta (o componente pelo UC pai) entra', async () => {
      const prog = await programacaoA();
      await programacoes.adicionarTarefasProgramacao(prog.id, { tarefas_ids: [tarefa.uar] });
      expect(await tarefasDa(prog.id)).toEqual([tarefa.a1.trim(), tarefa.uar.trim()].sort());
    });
  });

  describe('tarefas e exclusão conferem o escopo', () => {
    it('técnico de outra planta: adicionar, editar e remover tarefa dão 404 e nada muda', async () => {
      const prog = await programacaoA();
      await expect(programacoes.adicionarTarefasProgramacao(prog.id, { tarefas_ids: [tarefa.uar] }, TECNICO_B, tecnicoB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        programacoes.atualizarTarefasProgramacao(prog.id, { tarefas: [{ tarefa_id: tarefa.a1, ordem: 9 }] } as never, TECNICO_B, tecnicoB),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(programacoes.removerTarefaProgramacao(prog.id, tarefa.a1, TECNICO_B, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      const vinculos = await prisma.tarefas_programacao_os.findMany({ where: { programacao_id: prog.id } });
      expect(vinculos.map((v) => [v.tarefa_id?.trim(), v.ordem])).toEqual([[tarefa.a1.trim(), 1]]);
    });

    it('técnico de outra planta não exclui (404)', async () => {
      const prog = await programacaoA();
      await expect(programacoes.deletar(prog.id, TECNICO_B, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      expect((await prisma.programacoes_os.findUniqueOrThrow({ where: { id: prog.id } })).deletado_em).toBeNull();
    });

    it('quem é da planta segue mexendo', async () => {
      const prog = await programacaoA();
      await programacoes.adicionarTarefasProgramacao(prog.id, { tarefas_ids: [tarefa.uar] }, DONO_A, clienteA);
      await programacoes.removerTarefaProgramacao(prog.id, tarefa.uar, DONO_A, clienteA);
      await programacoes.deletar(prog.id, DONO_A, clienteA);
      expect((await prisma.programacoes_os.findUniqueOrThrow({ where: { id: prog.id } })).deletado_em).not.toBeNull();
    });
  });

  describe('from-solicitacao', () => {
    const solicitacao = (lado: string, plantaId: string) =>
      prisma.solicitacoes_servico.create({
        data: { numero: `${PREFIXO}-${lado}`, titulo: `${PREFIXO} ${lado}`, descricao: 'x', tipo: 'INSPECAO', planta_id: plantaId, solicitante_nome: 'x', local: 'x', status: 'PROPOSTA_REVISADA' },
      });

    it('a rota tem DTO em classe: o ValidationPipe recusa campo de fora e valor inválido', async () => {
      const [, metatype] = Reflect.getMetadata('design:paramtypes', ProgramacaoOSController.prototype, 'criarDeSolicitacao');
      expect(metatype).toBe(AjustesDaProgramacaoDaSolicitacaoDto);
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const corpo = (valor: object) => pipe.transform(valor, { type: 'body', metatype });
      await expect(corpo({ solicitacao_servico_id: 'outra' })).rejects.toBeInstanceOf(BadRequestException);
      // A planta e a instalação passam desde 28/out/2026: valem só para a solicitação sem
      // planta, que as escolhe ao programar (a que tem planta não muda: o teste abaixo)
      await expect(corpo({ planta_id: PLANTA_B })).resolves.toEqual({ planta_id: PLANTA_B });
      await expect(corpo({ planta_id: 'curto' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(corpo({ prioridade: 'QUALQUER' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(corpo({ descricao: 'ajustada', prioridade: PrioridadeOS.ALTA })).resolves.toEqual({ descricao: 'ajustada', prioridade: PrioridadeOS.ALTA });
    });

    it('nem chamando o service direto o ajuste troca a solicitação, a planta ou a origem', async () => {
      const a = await solicitacao('A', PLANTA_A);
      const b = await solicitacao('B', PLANTA_B);
      const prog = await programacoes.criarDeSolicitacao(a.id, {
        descricao: `${PREFIXO} ajustada`,
        solicitacao_servico_id: b.id,
        planta_id: PLANTA_B,
        origem: OrigemOS.MANUAL,
      } as never);
      const gravada = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: prog.id } });
      expect([gravada.descricao, gravada.solicitacao_servico_id?.trim(), gravada.planta_id?.trim(), gravada.origem]).toEqual([
        `${PREFIXO} ajustada`,
        a.id.trim(),
        PLANTA_A,
        OrigemOS.SOLICITACAO_SERVICO,
      ]);
    });
  });

  describe('estatísticas da listagem', () => {
    it('contam só as programações do escopo de quem lista', async () => {
      await programacaoA();
      await programacoes.criar({
        descricao: `${PREFIXO} preventiva B`,
        condicoes: CondicaoOS.FUNCIONANDO,
        tipo: TipoOS.PREVENTIVA,
        prioridade: PrioridadeOS.MEDIA,
        origem: OrigemOS.TAREFA,
        tarefas_ids: [tarefa.b],
      } as never);

      const doTecnico = await programacoes.listar({ page: 1, limit: 10 } as never, tecnicoB);
      expect(doTecnico.pagination.total).toBe(1);
      expect(doTecnico.stats).toEqual({ pendentes: 1, aprovadas: 0, finalizadas: 0, canceladas: 0 });

      const deTodos = await programacoes.listar({ page: 1, limit: 10 } as never, { id: DONO_A, role: 'admin' });
      expect(deTodos.stats.pendentes).toBeGreaterThanOrEqual(2);
    });
  });
});

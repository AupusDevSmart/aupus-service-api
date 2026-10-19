import { NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import { InstrucoesService } from './instrucoes.service';

/**
 * O que pende da instrução respeita o escopo por planta (SN-40). As rotas
 * `/instrucoes/:id/anomalias|solicitacoes|tarefas` pedem só `manutencao.view`,
 * que o técnico de campo e o cliente têm, e listavam o que era de todas as
 * plantas. A associação com anomalia gravava o autor que viesse no corpo e
 * não conferia a planta da anomalia. Contra Postgres real.
 */
describe('instrução: anomalias, solicitações e tarefas no escopo (banco real)', () => {
  const prisma = new PrismaService();
  const instrucoes = new InstrucoesService(prisma, {} as PropagacaoPlanosService, new PermissionScopeService(prisma));

  // 25 caracteres, como os ids cuid antigos, para provar o trim nas junções
  const ID = (s: string) => `testeinstescopo${s}`.padEnd(25, '0').slice(0, 25);
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
  const PREFIXO = 'TESTE-INST-ESCOPO';

  const clienteA = { id: DONO_A, role: 'proprietario' };
  const tecnicoB = { id: TECNICO_B, role: 'operador' };
  const gerente = { id: DONO_B, role: 'gerente' };

  let instrucaoId: string;
  const anomalia: Record<'a' | 'uar' | 'b', string> = { a: '', uar: '', b: '' };

  const apagar = async () => {
    await prisma.anomalias_instrucoes.deleteMany({ where: { instrucao: { tag: PREFIXO } } });
    await prisma.solicitacoes_instrucoes.deleteMany({ where: { instrucao: { tag: PREFIXO } } });
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
    await prisma.instrucoes.deleteMany({ where: { tag: PREFIXO } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: PREFIXO } } });
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
    await apagar();
    for (const id of [DONO_A, DONO_B, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@inst-escopo.teste` } });
    await planta(PLANTA_A, DONO_A, '92.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '92.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    // Componente (UAR) não tem unidade: a planta vem do UC pai
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha A', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });

    instrucaoId = (
      await prisma.instrucoes.create({
        data: { tag: PREFIXO, nome: 'Limpeza', descricao: 'x', categoria: 'MECANICA', tipo_manutencao: 'PREVENTIVA', condicao_ativo: 'PARADO', criticidade: 3, duracao_estimada: 1, tempo_estimado: 30 },
      })
    ).id;

    // Tarefa do template (sem equipamento nem planta), a cópia do componente
    // (sem planta gravada) e a cópia da planta B
    for (const [lado, equipamento] of [['template', null], ['uar', UAR_A], ['b', UC_B]] as const) {
      await prisma.tarefas.create({ data: { tag: `${PREFIXO}-${lado}`, nome: lado, criticidade: 3, ordem: 1, instrucao_id: instrucaoId, equipamento_id: equipamento } });
    }

    const novaAnomalia = async (lado: string, equipamento: string, plantaId: string | null) =>
      (await prisma.anomalias.create({ data: { descricao: `${PREFIXO} ${lado}`, local: 'x', ativo: 'x', origem: 'OPERADOR', equipamento_id: equipamento, planta_id: plantaId } })).id;
    anomalia.a = await novaAnomalia('a', UC_A, PLANTA_A);
    anomalia.uar = await novaAnomalia('uar', UAR_A, null); // antiga, sem planta gravada
    anomalia.b = await novaAnomalia('b', UC_B, PLANTA_B);
    for (const id of Object.values(anomalia)) await prisma.anomalias_instrucoes.create({ data: { anomalia_id: id, instrucao_id: instrucaoId } });

    for (const [lado, plantaId] of [['A', PLANTA_A], ['B', PLANTA_B]]) {
      const solicitacao = await prisma.solicitacoes_servico.create({
        data: { numero: `${PREFIXO}-${lado}`, titulo: `${PREFIXO} ${lado}`, descricao: 'x', tipo: 'INSPECAO', planta_id: plantaId, solicitante_nome: 'x', local: 'x' },
      });
      await prisma.solicitacoes_instrucoes.create({ data: { solicitacao_id: solicitacao.id, instrucao_id: instrucaoId } });
    }
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const anomaliasVistas = async (user: { id: string; role: string }) =>
    (await instrucoes.listarAnomalias(instrucaoId, user)).map((a) => a.anomalia.descricao).sort();

  describe('GET /instrucoes/:id/anomalias', () => {
    it('cliente vê só as da planta dele (a do componente pelo UC pai)', async () => {
      expect(await anomaliasVistas(clienteA)).toEqual([`${PREFIXO} a`, `${PREFIXO} uar`]);
    });

    it('técnico vê só as das plantas em que atua', async () => {
      expect(await anomaliasVistas(tecnicoB)).toEqual([`${PREFIXO} b`]);
    });

    it('quem vê todas as plantas vê todas', async () => {
      expect(await anomaliasVistas(gerente)).toHaveLength(3);
    });
  });

  describe('GET /instrucoes/:id/solicitacoes', () => {
    it('cada um vê as das plantas dele', async () => {
      const vistas = async (user: { id: string; role: string }) =>
        (await instrucoes.listarSolicitacoes(instrucaoId, user)).map((s) => s.solicitacao.numero).sort();
      expect(await vistas(clienteA)).toEqual([`${PREFIXO}-A`]);
      expect(await vistas(tecnicoB)).toEqual([`${PREFIXO}-B`]);
      expect(await vistas(gerente)).toEqual([`${PREFIXO}-A`, `${PREFIXO}-B`]);
    });
  });

  describe('GET /instrucoes/:id/tarefas', () => {
    it('as do escopo e as do template (que não tem planta)', async () => {
      const vistas = async (user: { id: string; role: string }) =>
        (await instrucoes.listarTarefasDerivadas(instrucaoId, user)).map((t) => t.tag).sort();
      expect(await vistas(clienteA)).toEqual([`${PREFIXO}-template`, `${PREFIXO}-uar`]);
      expect(await vistas(tecnicoB)).toEqual([`${PREFIXO}-b`, `${PREFIXO}-template`]);
      expect(await vistas(gerente)).toHaveLength(3);
    });
  });

  describe('associar e desassociar anomalia', () => {
    afterEach(async () => {
      await prisma.anomalias_instrucoes.deleteMany({ where: { instrucao_id: instrucaoId, observacoes: 'nova' } });
    });

    it('o autor é quem está logado, não o que vem no corpo', async () => {
      const outra = await prisma.anomalias.create({ data: { descricao: `${PREFIXO} nova`, local: 'x', ativo: 'x', origem: 'OPERADOR', equipamento_id: UC_A, planta_id: PLANTA_A } });
      const associacao = await instrucoes.associarAnomalia(instrucaoId, outra.id, 'nova', gerente);
      expect(associacao.created_by?.trim()).toBe(DONO_B);
    });

    it('anomalia de outra planta: recusa (404) e não grava', async () => {
      const outra = await prisma.anomalias.create({ data: { descricao: `${PREFIXO} nova a`, local: 'x', ativo: 'x', origem: 'OPERADOR', equipamento_id: UC_A, planta_id: PLANTA_A } });
      await expect(instrucoes.associarAnomalia(instrucaoId, outra.id, 'nova', tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.anomalias_instrucoes.count({ where: { anomalia_id: outra.id } })).toBe(0);
    });

    it('desassociar a anomalia de outra planta: recusa (404) e a associação fica', async () => {
      await expect(instrucoes.desassociarAnomalia(instrucaoId, anomalia.a, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.anomalias_instrucoes.count({ where: { anomalia_id: anomalia.a, instrucao_id: instrucaoId } })).toBe(1);
    });
  });
});

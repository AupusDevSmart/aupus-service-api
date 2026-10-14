import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionScopeService, type ScopedEntityType } from './permission-scope.service';

/**
 * O escopo por planta contra Postgres de verdade (SN-30). As permissões dizem o
 * que a pessoa faz; o escopo diz ONDE: o técnico só nas plantas em que atua, o
 * cliente só nas dele. Nunca teve teste — e o caminho de OS e programação
 * consultava uma coluna que não existe (deleted_at, em tabela que usa
 * deletado_em), quebrando toda ação do técnico numa OS.
 */
describe('PermissionScopeService (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);

  const ID = (s: string) => `testeescopo${s}`.padEnd(26, '0').slice(0, 26);
  const DONO = ID('dono');
  const OUTRO_DONO = ID('outrodono');
  const TECNICO = ID('tecnico');
  const SEM_VINCULO = ID('semvinculo');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const EQUIP_A = ID('equipa');
  const EQUIP_B = ID('equipb');

  const tecnico = { id: TECNICO, role: 'operador' };
  const cliente = { id: DONO, role: 'proprietario' };
  const admin = { id: ID('admin'), role: 'admin' };

  const ids: Partial<Record<ScopedEntityType, { a: string; b: string }>> = {};

  const limpar = async () => {
    await prisma.ordens_servico.deleteMany({ where: { numero_os: { startsWith: 'TESTE-ESCOPO' } } });
    await prisma.programacoes_os.deleteMany({ where: { codigo: { startsWith: 'TESTE-ESCOPO' } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: 'TESTE-ESCOPO' } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: 'TESTE-ESCOPO' } } });
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: 'TESTE-ESCOPO' } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [EQUIP_A, EQUIP_B] } } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE_A } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, OUTRO_DONO, TECNICO, SEM_VINCULO] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: {
        id,
        nome: `TESTE-ESCOPO ${id}`,
        cnpj,
        localizacao: 'x',
        horario_funcionamento: '08-18',
        logradouro: 'Rua',
        cidade: 'Goiânia',
        uf: 'GO',
        cep: '74000-000',
        proprietario_id: dono,
      },
    });

  beforeAll(async () => {
    await limpar();
    for (const [id, nome] of [
      [DONO, 'Dono'],
      [OUTRO_DONO, 'Outro dono'],
      [TECNICO, 'Técnico'],
      [SEM_VINCULO, 'Sem vínculo'],
    ]) {
      await prisma.usuarios.create({ data: { id, nome, email: `${id}@escopo.teste` } });
    }
    await planta(PLANTA_A, DONO, '98.000.000/0001-01');
    await planta(PLANTA_B, OUTRO_DONO, '98.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO, planta_id: PLANTA_A } });
    await prisma.unidades.create({
      data: {
        id: UNIDADE_A,
        planta_id: PLANTA_A,
        nome: 'TESTE-ESCOPO unidade',
        tipo: 'UFV',
        estado: 'GO',
        cidade: 'Goiânia',
        latitude: 0,
        longitude: 0,
        potencia: 1,
      },
    });
    // A: equipamento só pela unidade (planta_id vazio); B: planta direta
    await prisma.equipamentos.create({ data: { id: EQUIP_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    await prisma.equipamentos.create({ data: { id: EQUIP_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', planta_id: PLANTA_B } });

    const prog = (lado: string, plantaId: string) =>
      prisma.programacoes_os.create({
        data: {
          codigo: `TESTE-ESCOPO-${lado}`,
          descricao: 'x',
          condicoes: 'FUNCIONANDO',
          tipo: 'CORRETIVA',
          origem: 'MANUAL',
          tempo_estimado: 1,
          duracao_estimada: 1,
          planta_id: plantaId,
        },
      });
    const progA = await prog('A', PLANTA_A);
    const progB = await prog('B', PLANTA_B);
    ids.programacao_os = { a: progA.id, b: progB.id };

    const os = (lado: string, programacaoId: string, plantaId: string) =>
      prisma.ordens_servico.create({
        data: {
          programacao_id: programacaoId,
          numero_os: `TESTE-ESCOPO-${lado}`,
          descricao: 'x',
          condicoes: 'FUNCIONANDO',
          tipo: 'CORRETIVA',
          prioridade: 'MEDIA',
          origem: 'MANUAL',
          tempo_estimado: 1,
          duracao_estimada: 1,
          planta_id: plantaId,
        },
      });
    ids.ordem_servico = { a: (await os('A', progA.id, PLANTA_A)).id, b: (await os('B', progB.id, PLANTA_B)).id };

    const anomalia = (equipamentoId: string) =>
      prisma.anomalias.create({ data: { descricao: 'TESTE-ESCOPO', local: 'x', ativo: 'x', origem: 'OPERADOR', equipamento_id: equipamentoId } });
    ids.anomalia = { a: (await anomalia(EQUIP_A)).id, b: (await anomalia(EQUIP_B)).id };

    const solicitacao = (lado: string, plantaId: string) =>
      prisma.solicitacoes_servico.create({
        data: {
          numero: `TESTE-ESCOPO-${lado}`,
          titulo: 'x',
          descricao: 'x',
          tipo: 'INSPECAO',
          planta_id: plantaId,
          solicitante_nome: 'x',
          local: 'x',
        },
      });
    ids.solicitacao_servico = { a: (await solicitacao('A', PLANTA_A)).id, b: (await solicitacao('B', PLANTA_B)).id };

    const tarefa = (lado: string, equipamentoId: string) =>
      prisma.tarefas.create({ data: { tag: `TESTE-ESCOPO-${lado}`, nome: 'x', criticidade: 3, ordem: 1, equipamento_id: equipamentoId } });
    ids.tarefa = { a: (await tarefa('A', EQUIP_A)).id, b: (await tarefa('B', EQUIP_B)).id };

    ids.planta = { a: PLANTA_A, b: PLANTA_B };
    ids.unidade = { a: UNIDADE_A, b: UNIDADE_A };
    ids.equipamento = { a: EQUIP_A, b: EQUIP_B };
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  describe('getScope', () => {
    it('técnico: as plantas em que atua; cliente: as dele; os demais: todas (sem filtro)', async () => {
      expect(await escopo.getScope(tecnico)).toEqual([PLANTA_A]);
      expect(await escopo.getScope(cliente)).toEqual([PLANTA_A]);
      expect(await escopo.getScope(admin)).toBeNull();
    });

    it('técnico sem vínculo não vê planta nenhuma (lista vazia, não "tudo")', async () => {
      expect(await escopo.getScope({ id: SEM_VINCULO, role: 'operador' })).toEqual([]);
    });
  });

  const tipos: ScopedEntityType[] = ['planta', 'equipamento', 'anomalia', 'tarefa', 'ordem_servico', 'programacao_os', 'solicitacao_servico'];

  describe.each(tipos)('assertEntityInScope(%s)', (tipo) => {
    it('dentro da planta do técnico e do cliente passa', async () => {
      await expect(escopo.assertEntityInScope(tipo, ids[tipo]!.a, tecnico)).resolves.toBeUndefined();
      await expect(escopo.assertEntityInScope(tipo, ids[tipo]!.a, cliente)).resolves.toBeUndefined();
    });

    it('de outra planta é recusado (403)', async () => {
      await expect(escopo.assertEntityInScope(tipo, ids[tipo]!.b, tecnico)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(escopo.assertEntityInScope(tipo, ids[tipo]!.b, cliente)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('o id com o espaço do Char(26) dá o mesmo resultado', async () => {
      await expect(escopo.assertEntityInScope(tipo, `${ids[tipo]!.a.trim()}  `, tecnico)).resolves.toBeUndefined();
    });
  });

  it('o equipamento sem planta direta vale pela planta da unidade', async () => {
    await expect(escopo.assertEntityInScope('unidade', UNIDADE_A, tecnico)).resolves.toBeUndefined();
    await expect(escopo.assertEntityInScope('equipamento', EQUIP_A, { id: OUTRO_DONO, role: 'proprietario' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('o que não existe é 404, e o admin passa por tudo sem consultar', async () => {
    await expect(escopo.assertEntityInScope('ordem_servico', 'nao-existe', tecnico)).rejects.toBeInstanceOf(NotFoundException);
    await expect(escopo.assertEntityInScope('ordem_servico', ids.ordem_servico!.b, admin)).resolves.toBeUndefined();
  });
});

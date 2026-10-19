import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { TarefasService } from '../tarefas/tarefas.service';
import { PlanosManutencaoService } from './planos-manutencao.service';
import { PropagacaoPlanosService } from './propagacao-planos.service';

/**
 * A lista de planos vinculados (`?vinculados=true`, as cópias por equipamento)
 * respeita o escopo por planta. Antes o `user` chegava e era ignorado: o técnico
 * e o cliente, que têm `manutencao.view`, viam os planos e os nomes dos
 * equipamentos das plantas dos outros (achado no SN-36). Contra Postgres real.
 */
describe('planos vinculados pelo escopo da planta (banco real)', () => {
  const prisma = new PrismaService();
  const planos = new PlanosManutencaoService(prisma, new PermissionScopeService(prisma), new PropagacaoPlanosService(prisma));
  const tarefas = new TarefasService(prisma, new PermissionScopeService(prisma), new PropagacaoPlanosService(prisma));

  const ID = (s: string) => `testeplanoescopo${s}`.padEnd(26, '0').slice(0, 26);
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
  // 25 caracteres, como os ids cuid antigos, para provar o trim (SN-40)
  const ANTIGO_A = `testeplanoescopo${'antigoa'}`.padEnd(25, '0').slice(0, 25);
  const PREFIXO = 'TESTE-PLANO-ESCOPO';
  // Nome à parte: o plano antigo também é de equipamento e entraria na lista
  // de vinculados das buscas acima
  const ANTIGO = 'TESTE-PLANOANTIGO-ESCOPO';
  let templateId: string;
  let copiaAId: string;
  let antigoAId: string;

  const apagar = async () => {
    await prisma.planos_manutencao.deleteMany({ where: { nome: { startsWith: PREFIXO }, equipamento_id: { not: null } } });
    await prisma.planos_manutencao.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.planos_manutencao.deleteMany({ where: { nome: { startsWith: ANTIGO } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR_A] } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC_A, UC_B, ANTIGO_A] } } });
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
    for (const id of [DONO_A, DONO_B, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@plano-escopo.teste` } });
    await planta(PLANTA_A, DONO_A, '94.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '94.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha A', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });

    const template = await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} template` } });
    templateId = template.id;
    for (const [equipamento, nome] of [[UC_A, 'A'], [UAR_A, 'componente A'], [UC_B, 'B']]) {
      const copia = await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} ${nome}`, equipamento_id: equipamento, plano_origem_id: template.id } });
      if (equipamento === UC_A) copiaAId = copia.id;
    }

    // Plano de equipamento antigo, de antes do template por categoria: não tem
    // origem, então cai na lista de templates — mas é de uma planta (SN-40)
    await prisma.equipamentos.create({ data: { id: ANTIGO_A, nome: 'Inversor antigo A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    antigoAId = (await prisma.planos_manutencao.create({ data: { nome: `${ANTIGO} A`, equipamento_id: ANTIGO_A } })).id;
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const vinculados = async (user?: { id: string; role: string }) =>
    (await planos.listar({ page: 1, limit: 100, vinculados: true, search: PREFIXO } as never, user)).data
      .map((p) => p.nome)
      .sort();

  it('cliente vê só os planos da planta dele (o componente pelo UC pai)', async () => {
    expect(await vinculados({ id: DONO_A, role: 'proprietario' })).toEqual([`${PREFIXO} A`, `${PREFIXO} componente A`]);
  });

  it('técnico vê só os planos das plantas em que atua', async () => {
    expect(await vinculados({ id: TECNICO_B, role: 'operador' })).toEqual([`${PREFIXO} B`]);
  });

  it('técnico sem planta não vê nenhum', async () => {
    expect(await vinculados({ id: DONO_B, role: 'operador' })).toEqual([]);
  });

  it('quem vê todas as plantas vê todos', async () => {
    expect(await vinculados({ id: DONO_A, role: 'admin' })).toHaveLength(3);
  });

  const templates = async (user?: { id: string; role: string }, extra: Record<string, unknown> = {}) =>
    (await planos.listar({ page: 1, limit: 100, search: PREFIXO, ...extra } as never, user)).data.map((p) => p.nome).sort();
  const antigos = async (user?: { id: string; role: string }, extra: Record<string, unknown> = {}) =>
    (await planos.listar({ page: 1, limit: 100, search: ANTIGO, ...extra } as never, user)).data.map((p) => p.nome);

  it('a lista de templates continua sem escopo (template não tem planta)', async () => {
    expect(await templates({ id: TECNICO_B, role: 'operador' })).toEqual([`${PREFIXO} template`]);
  });

  describe('plano de equipamento antigo, sem origem (SN-40)', () => {
    it('na lista de templates, só para quem tem a planta dele (o template segue para todos)', async () => {
      expect(await antigos({ id: DONO_A, role: 'proprietario' })).toEqual([`${ANTIGO} A`]);
      expect(await antigos({ id: DONO_B, role: 'proprietario' })).toEqual([]);
      expect(await antigos({ id: TECNICO_B, role: 'operador' })).toEqual([]);
      expect(await templates({ id: DONO_B, role: 'proprietario' })).toEqual([`${PREFIXO} template`]);
    });

    it('quem vê todas as plantas segue vendo tudo, como antes', async () => {
      expect(await antigos({ id: DONO_A, role: 'admin' })).toEqual([`${ANTIGO} A`]);
      expect(await antigos()).toEqual([`${ANTIGO} A`]);
    });

    it('filtrando pelo equipamento: o de outra planta não aparece', async () => {
      expect(await antigos({ id: TECNICO_B, role: 'operador' }, { equipamento_id: ANTIGO_A })).toEqual([]);
      expect(await antigos({ id: DONO_A, role: 'proprietario' }, { equipamento_id: ANTIGO_A })).toEqual([`${ANTIGO} A`]);
    });
  });

  describe('por id: resumo, propagação e o próprio plano (SN-40)', () => {
    it('resumo do plano de outra planta: 404; o da planta e o do template passam', async () => {
      await expect(planos.obterResumo(copiaAId, { id: TECNICO_B, role: 'operador' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(planos.obterResumo(antigoAId, { id: TECNICO_B, role: 'operador' })).rejects.toBeInstanceOf(NotFoundException);
      expect((await planos.obterResumo(copiaAId, { id: DONO_A, role: 'proprietario' })).nome).toBe(`${PREFIXO} A`);
      expect((await planos.obterResumo(templateId, { id: TECNICO_B, role: 'operador' })).nome).toBe(`${PREFIXO} template`);
    });

    it('propagação do plano de outra planta: 404; a do template passa', async () => {
      await expect(planos.consultarPropagacoes(copiaAId, { id: TECNICO_B, role: 'operador' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(planos.consultarPropagacoes(templateId, { id: TECNICO_B, role: 'operador' })).resolves.toEqual([]);
    });

    // SN-53: a prévia sem equipamento olhava só se o plano tinha origem, e o
    // antigo não tem: mostraria as tarefas do equipamento de outra planta
    it('a prévia dos primeiros vencimentos recusa o plano antigo de equipamento (não é template)', async () => {
      const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

      await expect(planos.primeirosVencimentosDoVinculo(antigoAId, { data_inicio: hoje }, { id: TECNICO_B, role: 'operador' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(planos.primeirosVencimentosDoVinculo(copiaAId, { data_inicio: hoje }, { id: TECNICO_B, role: 'operador' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('o template se abre para o técnico (antes dava 404: o escopo procurava o equipamento que ele não tem)', async () => {
      expect((await planos.buscarPorId(templateId, false, { id: TECNICO_B, role: 'operador' })).nome).toBe(`${PREFIXO} template`);
      await expect(planos.buscarPorId(copiaAId, false, { id: TECNICO_B, role: 'operador' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // Criar tarefa não recebia o usuário: sem escopo, e o autor vinha do corpo (SN-53)
  describe('criar tarefa na cópia de um equipamento', () => {
    let instrucaoId = '';
    beforeAll(async () => {
      instrucaoId = (
        await prisma.instrucoes.create({
          data: {
            tag: `${PREFIXO}-INSTR`, nome: 'Instrução escopo', descricao: 'x', categoria: 'LIMPEZA', tipo_manutencao: 'PREVENTIVA',
            condicao_ativo: 'QUALQUER', criticidade: 3, duracao_estimada: 1, tempo_estimado: 10, updated_at: new Date(),
          },
        })
      ).id;
    });
    afterAll(async () => {
      await prisma.tarefas.deleteMany({ where: { instrucao_id: instrucaoId } });
      await prisma.instrucoes.deleteMany({ where: { id: instrucaoId } });
    });

    const nova = (plano: string) => ({ plano_manutencao_id: plano, nome: 'Tarefa escopo', instrucao_id: instrucaoId, criticidade: 3, frequencia: 'MENSAL', criado_por: TECNICO_B });

    it('o técnico de outra planta não cria tarefa no plano desta', async () => {
      await expect(tarefas.criar(nova(copiaAId) as never, { id: TECNICO_B, role: 'operador' })).rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.tarefas.count({ where: { instrucao_id: instrucaoId } })).toBe(0);
    });

    it('quem cria é o autor, não o que veio no corpo', async () => {
      const criada = await tarefas.criar(nova(copiaAId) as never, { id: DONO_A, role: 'proprietario' });

      const gravada = await prisma.tarefas.findFirst({ where: { id: criada.id }, select: { criado_por: true } });
      expect(gravada?.criado_por?.trim()).toBe(DONO_A);
    });
  });
});

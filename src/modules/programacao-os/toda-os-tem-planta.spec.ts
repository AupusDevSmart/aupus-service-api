import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CondicaoOS, OrigemOS, PermissionScopeService, PrioridadeOS, PrismaService, TipoOS } from '@/core';
import { ProgramacaoOSService } from './programacao-os.service';
import { AnomaliasService } from '../anomalias/anomalias.service';
import { CondicaoAnomalia, OrigemAnomalia, PrioridadeAnomalia } from '../anomalias/dto/create-anomalia.dto';

/**
 * Toda anomalia e toda programação têm planta (SN-35). É pela planta que o
 * técnico de campo e o cliente enxergam o trabalho: a programação manual antiga
 * e a da anomalia sem planta ficavam invisíveis para quem ia executar. A
 * anomalia grava a planta do equipamento; a programação, a da origem; sem
 * planta, recusa. Contra Postgres real.
 */
describe('toda anomalia e programação tem planta (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const programacoes = new ProgramacaoOSService(prisma, escopo);
  const anomalias = new AnomaliasService(prisma, escopo);

  // 25 caracteres, como os ids cuid antigos, para provar o trim nas junções
  const ID = (s: string) => `testetodaplanta${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UNIDADE_B = ID('unidadeb');
  const UC_A = ID('uca');
  const UAR_A = ID('uara');
  const UC_B = ID('ucb');
  const PREFIXO = 'TESTE-TODA-PLANTA';
  const tecnicoB = { id: TECNICO_B, role: 'operador' };

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
  };

  const apagarFixos = async () => {
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR_A, UC_A, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, TECNICO_B] } } });
  };

  const planta = (id: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
  const unidade = (id: string, plantaId: string) =>
    prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `${PREFIXO} ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });

  beforeAll(async () => {
    await limpar();
    await apagarFixos();
    for (const id of [DONO, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@toda-planta.teste` } });
    await planta(PLANTA_A, '96.000.000/0001-01');
    await planta(PLANTA_B, '96.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    // Componente (UAR) não tem unidade: a planta vem do UC pai
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha do inversor', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await apagarFixos();
    await prisma.$disconnect();
  });

  const novaAnomalia = (equipamentoId?: string) =>
    anomalias.create({
      descricao: `${PREFIXO} vazamento`,
      localizacao: { equipamentoId, local: 'Usina', ativo: 'Inversor' },
      condicao: CondicaoAnomalia.FUNCIONANDO,
      origem: OrigemAnomalia.OPERADOR,
      prioridade: PrioridadeAnomalia.MEDIA,
    });

  const novaProgramacao = (extra: Record<string, unknown> = {}, user?: { id: string; role: string }) =>
    programacoes.criar(
      {
        descricao: `${PREFIXO} manutenção`,
        condicoes: CondicaoOS.FUNCIONANDO,
        tipo: TipoOS.CORRETIVA,
        prioridade: PrioridadeOS.MEDIA,
        origem: OrigemOS.MANUAL,
        ...extra,
      } as never,
      undefined,
      user,
    );

  const plantaGravada = async (programacaoId: string) =>
    (await prisma.programacoes_os.findUniqueOrThrow({ where: { id: programacaoId } })).planta_id?.trim();

  describe('anomalia', () => {
    it('grava a planta do equipamento (antes só conferia o escopo e não gravava)', async () => {
      const anomalia = await novaAnomalia(UC_A);
      expect(anomalia.planta_id?.trim()).toBe(PLANTA_A);
    });

    it('componente (UAR): a planta do UC pai', async () => {
      const anomalia = await novaAnomalia(UAR_A);
      expect(anomalia.planta_id?.trim()).toBe(PLANTA_A);
    });

    it('sem equipamento: recusa', async () => {
      await expect(novaAnomalia(undefined)).rejects.toThrow(BadRequestException);
      expect(await prisma.anomalias.count({ where: { descricao: { startsWith: PREFIXO } } })).toBe(0);
    });

    it('trocar o equipamento leva a planta junto', async () => {
      const anomalia = await novaAnomalia(UC_A);
      await anomalias.update(anomalia.id, { localizacao: { equipamentoId: UC_B, local: 'Usina B', ativo: 'Inversor B' } });
      const salva = await prisma.anomalias.findUniqueOrThrow({ where: { id: anomalia.id } });
      expect(salva.planta_id?.trim()).toBe(PLANTA_B);
    });
  });

  describe('programação', () => {
    it('manual sem planta: recusa', async () => {
      await expect(novaProgramacao()).rejects.toThrow(/precisa de planta/);
    });

    it('manual com planta: grava a informada', async () => {
      const prog = await novaProgramacao({ planta_id: PLANTA_A });
      expect(await plantaGravada(prog.id)).toBe(PLANTA_A);
    });

    it('da anomalia, sem a tela mandar a planta: herda a da anomalia', async () => {
      const anomalia = await novaAnomalia(UC_A);
      const prog = await programacoes.criarDeAnomalia(anomalia.id, { ajustes: { descricao: `${PREFIXO} da anomalia` } } as never);
      expect(await plantaGravada(prog.id)).toBe(PLANTA_A);
    });

    it('anomalia antiga sem planta gravada: vale a do equipamento dela', async () => {
      const anomalia = await novaAnomalia(UAR_A);
      await prisma.anomalias.update({ where: { id: anomalia.id }, data: { planta_id: null } });
      const prog = await novaProgramacao({ origem: OrigemOS.ANOMALIA, anomalia_id: anomalia.id });
      expect(await plantaGravada(prog.id)).toBe(PLANTA_A);
    });

    it('planta informada diferente da origem: recusa', async () => {
      const anomalia = await novaAnomalia(UC_A);
      await expect(novaProgramacao({ origem: OrigemOS.ANOMALIA, anomalia_id: anomalia.id, planta_id: PLANTA_B })).rejects.toThrow(/não é a mesma/);
    });

    it('do componente (UAR): a planta do UC pai', async () => {
      const prog = await novaProgramacao({ equipamento_id: UAR_A });
      expect(await plantaGravada(prog.id)).toBe(PLANTA_A);
    });

    it('técnico de outra planta não programa a anomalia omitindo a planta (o escopo confere a da origem)', async () => {
      const anomalia = await novaAnomalia(UC_A);
      await expect(novaProgramacao({ origem: OrigemOS.ANOMALIA, anomalia_id: anomalia.id }, tecnicoB)).rejects.toThrow(NotFoundException);
      expect(await prisma.programacoes_os.count({ where: { descricao: { startsWith: PREFIXO } } })).toBe(0);
    });

    it('pela rota from-anomalia também: o escopo vale (o user chega até o criar)', async () => {
      const anomalia = await novaAnomalia(UC_A);
      await expect(programacoes.criarDeAnomalia(anomalia.id, {}, TECNICO_B, tecnicoB)).rejects.toThrow(NotFoundException);
      expect(await prisma.programacoes_os.count({ where: { descricao: { startsWith: PREFIXO } } })).toBe(0);
    });

    it('editar com a planta vazia (a tela manda quando a origem não traz) mantém a gravada', async () => {
      const prog = await novaProgramacao({ planta_id: PLANTA_A });
      await programacoes.atualizar(prog.id, { planta_id: '' } as never);
      expect(await plantaGravada(prog.id)).toBe(PLANTA_A);
    });

    it('editar trocando a anomalia leva a planta da nova', async () => {
      const anomaliaA = await novaAnomalia(UC_A);
      const anomaliaB = await novaAnomalia(UC_B);
      const prog = await novaProgramacao({ origem: OrigemOS.ANOMALIA, anomalia_id: anomaliaA.id });

      await programacoes.atualizar(prog.id, { anomalia_id: anomaliaB.id } as never);

      expect(await plantaGravada(prog.id)).toBe(PLANTA_B);
    });

    it('editar trocando a planta da manual vale (não há origem que diga outra)', async () => {
      const prog = await novaProgramacao({ planta_id: PLANTA_A });
      await programacoes.atualizar(prog.id, { planta_id: PLANTA_B } as never);
      expect(await plantaGravada(prog.id)).toBe(PLANTA_B);
    });
  });
});

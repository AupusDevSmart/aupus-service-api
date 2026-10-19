import { BadRequestException } from '@nestjs/common';
import { CondicaoOS, PermissionScopeService, PrioridadeOS, PrismaService, TipoOS } from '@/core';
import { apagarSolicitacoesDeTeste, solicitacaoDeTeste } from '../../../test/planta-de-teste';
import { ProgramacaoOSService } from './programacao-os.service';
import { garantirPessoasQuePodemAtuar, pessoasQuePodemAtuar } from './pessoas-da-os';

/**
 * Responsável e técnicos da programação/OS são usuários (SN-31). A equipe da
 * planta são os técnicos de campo vinculados a ela; planejador, gerente e
 * administrador apoiam em qualquer planta; cliente nunca. Contra Postgres real.
 */
describe('pessoas que podem atuar na OS (banco real)', () => {
  const prisma = new PrismaService();
  const programacoes = new ProgramacaoOSService(prisma, new PermissionScopeService(prisma));

  const MODEL_TYPE = 'App\\Models\\User';
  const PREFIXO = 'TESTE-PESSOAS-OS';
  // 25 caracteres, como os ids cuid antigos, para provar o trim nas junções
  const ID = (s: string) => `testepessoas${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const TECNICO_A = ID('tecnicoa');
  const TECNICO_B = ID('tecnicob');
  const TECNICO_INATIVO = ID('tecinativo');
  const PLANEJADOR = ID('planejador');
  const GERENTE = ID('gerente');
  const VENDEDOR = ID('vendedor');
  const PLANTA_A = ID('plantaa').padEnd(26, '0');
  const PLANTA_B = ID('plantab').padEnd(26, '0');
  const USUARIOS: [string, string, string | null][] = [
    [DONO, 'Dona da planta', 'proprietario'],
    [TECNICO_A, 'Ana Técnica', 'operador'],
    [TECNICO_B, 'Bruno Técnico', 'operador'],
    [TECNICO_INATIVO, 'Inácio Inativo', 'operador'],
    [PLANEJADOR, 'Paula Planejadora', 'analista'],
    [GERENTE, 'Gil Gerente', 'gerente'],
    [VENDEDOR, 'Vera Vendedora', null],
  ];
  const IDS = USUARIOS.map(([id]) => id);

  const limpar = async () => {
    const progs = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    const oss = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: progs } }, select: { id: true } })).map((o) => o.id);
    await prisma.historico_os.deleteMany({ where: { os_id: { in: oss } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: oss } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: progs } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: progs } } });
  };

  const apagarFixos = async () => {
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: { in: IDS } } });
    await apagarSolicitacoesDeTeste(prisma, [PLANTA_A, PLANTA_B]);
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: IDS }, model_type: MODEL_TYPE } });
    await prisma.usuarios.deleteMany({ where: { id: { in: IDS } } });
  };

  const planta = (id: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });

  const novaProgramacao = async (extra: Record<string, unknown> = {}) =>
    programacoes.criar({
      descricao: `${PREFIXO} manutenção`,
      condicoes: CondicaoOS.FUNCIONANDO,
      tipo: TipoOS.CORRETIVA,
      prioridade: PrioridadeOS.MEDIA,
      ...(await solicitacaoDeTeste(prisma, PLANTA_A)),
      planta_id: PLANTA_A,
      ...extra,
    } as never);

  beforeAll(async () => {
    await limpar();
    await apagarFixos();
    const papel: Record<string, bigint> = {};
    for (const nome of ['operador', 'proprietario', 'analista', 'gerente']) {
      papel[nome] = (
        await prisma.roles.upsert({
          where: { name_guard_name: { name: nome, guard_name: 'api' } },
          update: {},
          create: { name: nome, guard_name: 'api' },
        })
      ).id;
    }
    for (const [id, nome, role] of USUARIOS) {
      await prisma.usuarios.create({
        data: { id, nome, email: `${id}@pessoas-os.teste`, role: role ?? 'vendedor', status: id === TECNICO_INATIVO ? 'Inativo' : 'Ativo' },
      });
      if (role) await prisma.model_has_roles.create({ data: { model_id: id, model_type: MODEL_TYPE, role_id: papel[role] } });
    }
    await planta(PLANTA_A, '96.000.000/0001-01');
    await planta(PLANTA_B, '96.000.000/0001-02');
    await prisma.planta_operadores.createMany({
      data: [
        { usuario_id: TECNICO_A, planta_id: PLANTA_A },
        { usuario_id: TECNICO_INATIVO, planta_id: PLANTA_A },
        { usuario_id: TECNICO_B, planta_id: PLANTA_B },
      ],
    });
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await apagarFixos();
    await prisma.$disconnect();
  });

  const doTeste = (lista: { id: string }[]) => lista.map((p) => p.id).filter((id) => IDS.includes(id));
  // Char(26) devolve o id de 25 caracteres com um espaço no fim
  const semEspaco = <T extends { tecnico_id: string | null }>(linhas: T[]) =>
    linhas.map((l) => ({ ...l, tecnico_id: l.tecnico_id?.trim() ?? null }));

  describe('opções da tela', () => {
    it('equipe = técnicos ativos vinculados à planta; apoio = planejador e gerente; cliente e sem papel fora', async () => {
      const { equipe, apoio } = await pessoasQuePodemAtuar(prisma, `${PLANTA_A}  `);

      expect(doTeste(equipe)).toEqual([TECNICO_A]);
      expect(doTeste(apoio)).toEqual([GERENTE, PLANEJADOR]); // por nome: Gil, Paula
      expect(equipe.find((p) => p.id === TECNICO_A)).toMatchObject({ nome: 'Ana Técnica', papel: 'operador' });
    });

    it('cada planta tem a sua equipe', async () => {
      const { equipe } = await pessoasQuePodemAtuar(prisma, PLANTA_B);
      expect(doTeste(equipe)).toEqual([TECNICO_B]);
    });

    it('sem planta não há equipe: só o apoio', async () => {
      const { equipe, apoio } = await pessoasQuePodemAtuar(prisma, null);
      expect(doTeste(equipe)).toEqual([]);
      expect(doTeste(apoio)).toEqual([GERENTE, PLANEJADOR]);
    });
  });

  describe('conferência no gravar', () => {
    it('aceita a equipe e o apoio, com o nome do cadastro', async () => {
      const pessoas = await garantirPessoasQuePodemAtuar(prisma, PLANTA_A, [` ${TECNICO_A} `, PLANEJADOR]);
      expect(pessoas.get(TECNICO_A)?.nome).toBe('Ana Técnica');
      expect(pessoas.get(PLANEJADOR)?.nome).toBe('Paula Planejadora');
    });

    it.each([
      ['técnico de outra planta', TECNICO_B, /Bruno Técnico não está na equipe desta planta/],
      ['cliente', DONO, /Dona da planta é cliente/],
      ['inativo', TECNICO_INATIVO, /Inácio Inativo está inativo/],
      ['sem tipo que atue em OS', VENDEDOR, /Vera Vendedora não tem um tipo/],
      ['inexistente', ID('ninguem'), /não encontrado/],
    ])('recusa %s', async (_caso, id, motivo) => {
      await expect(garantirPessoasQuePodemAtuar(prisma, PLANTA_A, [id])).rejects.toThrow(motivo);
    });

    it('técnico de campo sem planta definida: pede a planta', async () => {
      await expect(garantirPessoasQuePodemAtuar(prisma, null, [TECNICO_A])).rejects.toThrow(/escolha a planta/);
    });

    it('junta os motivos de todos numa mensagem só', async () => {
      const erro = await garantirPessoasQuePodemAtuar(prisma, PLANTA_A, [TECNICO_B, DONO]).catch((e) => e);
      expect(erro).toBeInstanceOf(BadRequestException);
      expect(erro.message).toMatch(/Bruno Técnico.*Dona da planta/);
    });
  });

  describe('programação e OS', () => {
    it('grava o nome do cadastro, não o que a tela mandou', async () => {
      const criada = await novaProgramacao({
        responsavel_id: PLANEJADOR,
        responsavel: 'qualquer coisa',
        tecnicos: [{ tecnico_id: TECNICO_A, nome: 'apelido', especialidade: 'Técnico Elétrico', horas_estimadas: 4 }],
      });

      const gravada = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: criada.id }, include: { tecnicos: true } });
      expect(gravada.responsavel).toBe('Paula Planejadora');
      expect(gravada.responsavel_id?.trim()).toBe(PLANEJADOR);
      expect(semEspaco(gravada.tecnicos)).toEqual([expect.objectContaining({ tecnico_id: TECNICO_A, nome: 'Ana Técnica' })]);
    });

    it('recusa técnico fora da equipe e não grava nada', async () => {
      await expect(
        novaProgramacao({ tecnicos: [{ tecnico_id: TECNICO_B, especialidade: 'Técnico Elétrico', horas_estimadas: 4 }] }),
      ).rejects.toThrow(/Bruno Técnico não está na equipe desta planta/);
      expect(await prisma.programacoes_os.count({ where: { descricao: { startsWith: PREFIXO } } })).toBe(0);
    });

    it('linha de perfil sem pessoa continua valendo (a instrução pede "um eletricista")', async () => {
      const criada = await novaProgramacao({ tecnicos: [{ especialidade: 'Técnico Elétrico', horas_estimadas: 2 }] });
      const gravada = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: criada.id }, include: { tecnicos: true } });
      expect(semEspaco(gravada.tecnicos)).toEqual([expect.objectContaining({ tecnico_id: null, nome: null })]);
    });

    it('editar troca o responsável e confere contra a planta nova', async () => {
      const criada = await novaProgramacao({ responsavel_id: PLANEJADOR });

      await programacoes.atualizar(criada.id, { responsavel_id: GERENTE, responsavel: 'x' } as never);
      const editada = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: criada.id } });
      expect(editada.responsavel).toBe('Gil Gerente');
      expect(editada.responsavel_id?.trim()).toBe(GERENTE);

      // Ana é da planta A: levar a programação para a B (a planta sai da origem:
      // uma solicitação da B) com ela escalada é recusado
      await expect(
        programacoes.atualizar(criada.id, {
          ...(await solicitacaoDeTeste(prisma, PLANTA_B)),
          planta_id: PLANTA_B,
          tecnicos: [{ tecnico_id: TECNICO_A, especialidade: 'Técnico Elétrico', horas_estimadas: 4 }],
        } as never),
      ).rejects.toThrow(/Ana Técnica não está na equipe desta planta/);
    });

    it('aprovar leva responsável e técnicos (com o usuário) para a OS', async () => {
      const criada = await novaProgramacao({
        responsavel_id: GERENTE,
        tecnicos: [{ tecnico_id: TECNICO_A, especialidade: 'Técnico Elétrico', horas_estimadas: 4 }],
      });

      await programacoes.aprovar(criada.id, {} as never, GERENTE);

      const os = await prisma.ordens_servico.findFirstOrThrow({ where: { programacao_id: criada.id }, include: { tecnicos: true } });
      expect(os.responsavel).toBe('Gil Gerente');
      expect(os.responsavel_id?.trim()).toBe(GERENTE);
      expect(semEspaco(os.tecnicos)).toEqual([expect.objectContaining({ tecnico_id: TECNICO_A, nome: 'Ana Técnica' })]);
    });
  });
});

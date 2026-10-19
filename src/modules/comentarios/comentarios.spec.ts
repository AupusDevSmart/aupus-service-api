import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { ProcessadorDeNotificacoes } from '../notificacoes/processador-de-notificacoes';
import { ComentariosService, PRAZO_DE_EDICAO_MS } from './comentarios.service';

/**
 * Comentários da OS e da solicitação (SN-48), contra Postgres real, com o
 * escopo de verdade (técnico pelas plantas que opera, cliente pelas de que é
 * dono, gerente em todas).
 */
describe('comentários (banco real)', () => {
  const prisma = new PrismaService();
  const servico = new ComentariosService(prisma, new PermissionScopeService(prisma));
  const processador = new ProcessadorDeNotificacoes(prisma);
  const ID = (s: string) => `testecoment${s}`.padEnd(26, '0').slice(0, 26);
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const CLIENTE_A = ID('clientea');
  const CLIENTE_B = ID('clienteb');
  const TECNICO_A = ID('tecnicoa');
  const TECNICO_B = ID('tecnicob');
  const GERENTE = ID('gerente');
  // Conta sem papel, com permissão direta: a regra do interno é lista de quem pode
  const SEM_PAPEL = ID('sempapel');
  const PROG = ID('prog');
  const OS = ID('os');
  const USUARIOS = [CLIENTE_A, CLIENTE_B, TECNICO_A, TECNICO_B, GERENTE, SEM_PAPEL];
  // O papel real da matriz: só papel da equipe vê o interno
  let solicitacao: string;

  const como = {
    clienteA: { id: CLIENTE_A, role: 'proprietario' },
    tecnicoA: { id: TECNICO_A, role: 'operador' },
    tecnicoB: { id: TECNICO_B, role: 'operador' },
    gerente: { id: GERENTE, role: 'gerente' },
    semPapel: { id: SEM_PAPEL, role: null },
  };

  const papel = (name: string) =>
    prisma.roles.upsert({ where: { name_guard_name: { name, guard_name: 'web' } }, update: {}, create: { name, guard_name: 'web' } });
  const darPapel = async (usuario: string, nome: string) => {
    const r = await papel(nome);
    await prisma.model_has_roles.create({ data: { role_id: r.id, model_id: usuario, model_type: 'App\\Models\\User' } });
  };

  const apagar = async () => {
    await prisma.notificacoes.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [OS, ...(solicitacao ? [solicitacao] : [])] } } });
    await prisma.comentarios_os.deleteMany({ where: { os_id: OS } });
    await prisma.ordens_servico.deleteMany({ where: { id: OS } });
    await prisma.programacoes_os.deleteMany({ where: { id: PROG } });
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: 'TESTE-COMENT' } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: USUARIOS } } });
    await prisma.model_has_permissions.deleteMany({ where: { model_id: { in: USUARIOS } } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: USUARIOS } } });
  };

  beforeAll(async () => {
    await apagar();
    for (const id of USUARIOS) {
      await prisma.usuarios.create({ data: { id, nome: `Nome ${id.slice(11, 19)}`, email: `${id}@coment.teste`, status: 'Ativo', is_active: true } });
    }
    for (const [id, dono, cnpj] of [[PLANTA_A, CLIENTE_A, '82.000.000/0001-01'], [PLANTA_B, CLIENTE_B, '82.000.000/0001-02']]) {
      await prisma.plantas.create({
        data: { id, nome: `Planta ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
      });
    }
    await darPapel(CLIENTE_A, 'proprietario');
    await darPapel(CLIENTE_B, 'proprietario');
    await darPapel(GERENTE, 'gerente');
    const programar = await prisma.permissions.upsert({
      where: { name_guard_name: { name: 'programacao_os.manage', guard_name: 'web' } },
      update: {},
      create: { name: 'programacao_os.manage', guard_name: 'web' },
    });
    await prisma.model_has_permissions.create({ data: { permission_id: programar.id, model_id: SEM_PAPEL, model_type: 'App\\Models\\User' } });
    for (const [tecnico, planta] of [[TECNICO_A, PLANTA_A], [TECNICO_B, PLANTA_B]]) {
      await darPapel(tecnico, 'operador');
      await prisma.planta_operadores.create({ data: { usuario_id: tecnico, planta_id: planta } });
    }
    await prisma.programacoes_os.create({
      data: {
        id: PROG, codigo: 'PROG-COMENT-1', descricao: 'Troca do disjuntor', condicoes: 'PARADO', tipo: 'CORRETIVA',
        origem: 'MANUAL', tempo_estimado: 1, duracao_estimada: 1, planta_id: PLANTA_A, atualizado_em: new Date(),
      },
    });
    await prisma.ordens_servico.create({
      data: {
        id: OS, programacao_id: PROG, numero_os: 'OS-COMENT-1', descricao: 'Troca do disjuntor', condicoes: 'PARADO', tipo: 'CORRETIVA',
        prioridade: 'ALTA', origem: 'MANUAL', tempo_estimado: 1, duracao_estimada: 1, planta_id: PLANTA_A, responsavel_id: TECNICO_A,
        atualizado_em: new Date(),
      },
    });
    solicitacao = (
      await prisma.solicitacoes_servico.create({
        data: { numero: 'TESTE-COMENT-1', titulo: 'Inversor parado', descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA_A, solicitante_nome: 'x', solicitante_id: CLIENTE_A, local: 'x' },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.comentarios_os.deleteMany({ where: { os_id: OS } });
    await prisma.comentarios_solicitacao_servico.deleteMany({ where: { solicitacao_id: solicitacao } });
    await prisma.notificacoes.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [OS, solicitacao] } } });
  });

  afterAll(async () => {
    await prisma.comentarios_solicitacao_servico.deleteMany({ where: { solicitacao_id: solicitacao } });
    await apagar();
    await prisma.$disconnect();
  });

  describe('escopo', () => {
    // 404, não 403: a resposta não confirma que a OS de outra planta existe
    it('técnico de outra planta não lê nem comenta na OS (404)', async () => {
      await expect(servico.listar('ordem_servico', OS, como.tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(servico.comentar('ordem_servico', OS, { comentario: 'intruso' }, como.tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.comentarios_os.count({ where: { os_id: OS } })).toBe(0);
    });

    it('registro que não existe: 404, inclusive para quem não tem escopo', async () => {
      await expect(servico.listar('ordem_servico', ID('naoexiste'), como.gerente)).rejects.toBeInstanceOf(NotFoundException);
      await expect(servico.listar('solicitacao_servico', ID('naoexiste'), como.gerente)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('OS excluída não aceita comentário, nem de quem não tem escopo', async () => {
      try {
        await prisma.ordens_servico.update({ where: { id: OS }, data: { deletado_em: new Date() } });
        await expect(servico.listar('ordem_servico', OS, como.gerente)).rejects.toBeInstanceOf(NotFoundException);
        await expect(servico.comentar('ordem_servico', OS, { comentario: 'x' }, como.gerente)).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await prisma.ordens_servico.update({ where: { id: OS }, data: { deletado_em: null } });
      }
    });

    it('o cliente lê os comentários da OS da planta dele', async () => {
      await servico.comentar('ordem_servico', OS, { comentario: 'Peça chega amanhã' }, como.tecnicoA);

      expect((await servico.listar('ordem_servico', OS, como.clienteA)).map((c) => c.comentario)).toEqual(['Peça chega amanhã']);
    });
  });

  describe('autor e interno', () => {
    it('o autor é quem está logado, com o nome do cadastro', async () => {
      const c = await servico.comentar('ordem_servico', OS, { comentario: '  Disjuntor trocado  ' }, como.tecnicoA);

      expect(c).toMatchObject({ comentario: 'Disjuntor trocado', autor: `Nome ${TECNICO_A.slice(11, 19)}`, autor_id: TECNICO_A, interno: false });
    });

    it('o cliente não vê o comentário interno; a equipe vê', async () => {
      await servico.comentar('ordem_servico', OS, { comentario: 'Cliente atrasou o acesso', interno: true }, como.gerente);
      await servico.comentar('ordem_servico', OS, { comentario: 'Acesso liberado' }, como.tecnicoA);

      expect((await servico.listar('ordem_servico', OS, como.clienteA)).map((c) => c.comentario)).toEqual(['Acesso liberado']);
      expect((await servico.listar('ordem_servico', OS, como.tecnicoA)).map((c) => [c.comentario, c.interno])).toEqual([
        ['Cliente atrasou o acesso', true],
        ['Acesso liberado', false],
      ]);
    });

    // A regra é lista de quem pode: conta sem papel (ou com papel legado) não é da
    // equipe. Desde o SN-76 ela também não tem planta nenhuma: a OS "não existe"
    it('conta sem papel não vê a OS nem comenta nela', async () => {
      await servico.comentar('ordem_servico', OS, { comentario: 'só a equipe', interno: true }, como.gerente);

      await expect(servico.listar('ordem_servico', OS, como.semPapel)).rejects.toThrow(new NotFoundException('Ordem de serviço não encontrada'));
      await expect(servico.comentar('ordem_servico', OS, { comentario: 'x', interno: true }, como.semPapel)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('o cliente comenta na solicitação dele, mas nunca interno', async () => {
      await expect(servico.comentar('solicitacao_servico', solicitacao, { comentario: 'x', interno: true }, como.clienteA)).rejects.toBeInstanceOf(ForbiddenException);

      const c = await servico.comentar('solicitacao_servico', solicitacao, { comentario: 'Pode vir na terça?' }, como.clienteA);
      expect(c.interno).toBe(false);
    });

    it('para o cliente, o comentário interno não existe nem para tentar editar', async () => {
      const interno = await servico.comentar('solicitacao_servico', solicitacao, { comentario: 'nota da equipe', interno: true }, como.gerente);

      await expect(servico.editar('solicitacao_servico', solicitacao, interno.id, { comentario: 'x' }, como.clienteA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('editar e excluir', () => {
    it('ninguém edita nem exclui o comentário de outro', async () => {
      const c = await servico.comentar('ordem_servico', OS, { comentario: 'do técnico' }, como.tecnicoA);

      await expect(servico.editar('ordem_servico', OS, c.id, { comentario: 'mudei' }, como.gerente)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(servico.excluir('ordem_servico', OS, c.id, como.gerente)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await servico.listar('ordem_servico', OS, como.gerente))[0].comentario).toBe('do técnico');
    });

    it('o próprio, dentro de 15 minutos: edita (marca editado) e exclui (some da lista)', async () => {
      const c = await servico.comentar('ordem_servico', OS, { comentario: 'primeira versão' }, como.tecnicoA);
      expect(c.editavel_ate).not.toBeNull();
      // Quanto falta, medido aqui: o front não depende do relógio do aparelho
      expect(c.editavel_por_ms).toBeGreaterThan(PRAZO_DE_EDICAO_MS - 60_000);
      // updated_at distinto do created_at: o "editado" só aparece com mais de 1 s de diferença
      await prisma.comentarios_os.update({ where: { id: c.id }, data: { created_at: new Date(Date.now() - 60_000), updated_at: new Date(Date.now() - 60_000) } });

      const editado = await servico.editar('ordem_servico', OS, c.id, { comentario: 'segunda versão' }, como.tecnicoA);
      expect(editado).toMatchObject({ comentario: 'segunda versão', editado: true });

      await servico.excluir('ordem_servico', OS, c.id, como.tecnicoA);
      expect(await servico.listar('ordem_servico', OS, como.tecnicoA)).toEqual([]);
      expect(await prisma.comentarios_os.count({ where: { id: c.id, deleted_at: { not: null } } })).toBe(1);
    });

    it('depois de 15 minutos não edita nem exclui, e a resposta diz que não dá mais', async () => {
      const c = await servico.comentar('ordem_servico', OS, { comentario: 'antigo' }, como.tecnicoA);
      await prisma.comentarios_os.update({ where: { id: c.id }, data: { created_at: new Date(Date.now() - PRAZO_DE_EDICAO_MS - 60_000) } });

      await expect(servico.editar('ordem_servico', OS, c.id, { comentario: 'x' }, como.tecnicoA)).rejects.toBeInstanceOf(ConflictException);
      await expect(servico.excluir('ordem_servico', OS, c.id, como.tecnicoA)).rejects.toBeInstanceOf(ConflictException);
      expect((await servico.listar('ordem_servico', OS, como.tecnicoA))[0].editavel_ate).toBeNull();
    });

    it('para quem não é o autor, nunca aparece como editável', async () => {
      await servico.comentar('ordem_servico', OS, { comentario: 'do técnico' }, como.tecnicoA);

      expect((await servico.listar('ordem_servico', OS, como.gerente))[0].editavel_ate).toBeNull();
    });
  });

  describe('notificação', () => {
    const avisados = async (evento: string) =>
      (await prisma.notificacoes.findMany({ where: { evento, usuario_id: { in: USUARIOS } } })).map((n) => n.usuario_id.trim()).sort();

    it('comentário na OS avisa os envolvidos, inclusive o cliente, menos quem comentou', async () => {
      await servico.comentar('ordem_servico', OS, { comentario: 'Peça chega amanhã' }, como.gerente);
      await processador.processarPendentes();

      expect(await avisados('os.comentario')).toEqual([CLIENTE_A, TECNICO_A].sort());
    });

    it('comentário interno nunca chega ao cliente, mesmo envolvido', async () => {
      await servico.comentar('ordem_servico', OS, { comentario: 'Cliente atrasou', interno: true }, como.gerente);
      await processador.processarPendentes();

      expect(await avisados('os.comentario_interno')).toEqual([TECNICO_A]);
    });

    it('na solicitação, o interno não avisa quem pediu quando é cliente', async () => {
      await servico.comentar('solicitacao_servico', solicitacao, { comentario: 'nota da equipe', interno: true }, como.gerente);
      await processador.processarPendentes();

      expect(await avisados('solicitacao.comentario_interno')).not.toContain(CLIENTE_A);
    });

    it('o interno não avisa conta sem papel, nem com a permissão de quem programa; o público avisa', async () => {
      await servico.comentar('solicitacao_servico', solicitacao, { comentario: 'nota da equipe', interno: true }, como.gerente);
      await servico.comentar('solicitacao_servico', solicitacao, { comentario: 'visita na terça' }, como.gerente);
      await processador.processarPendentes();

      expect(await avisados('solicitacao.comentario_interno')).not.toContain(SEM_PAPEL);
      expect(await avisados('solicitacao.comentario')).toContain(SEM_PAPEL);
    });

    it('o aviso não leva o texto do comentário', async () => {
      await servico.comentar('ordem_servico', OS, { comentario: 'texto que não pode vazar' }, como.gerente);
      await processador.processarPendentes();

      const [aviso] = await prisma.notificacoes.findMany({ where: { evento: 'os.comentario', usuario_id: TECNICO_A } });
      expect(`${aviso.titulo} ${aviso.descricao}`).not.toContain('não pode vazar');
      expect(aviso.titulo).toContain('OS-COMENT-1');
    });
  });
});

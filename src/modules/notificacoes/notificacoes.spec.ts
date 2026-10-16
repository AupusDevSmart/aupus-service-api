import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { EnvioDeNotificacoes } from './envio-de-notificacoes';
import { LimpezaDeNotificacoes } from './limpeza-de-notificacoes';
import { NotificacoesService } from './notificacoes.service';
import { ProcessadorDeNotificacoes } from './processador-de-notificacoes';
import type { Entidade, Evento } from './catalogo';
import { registrarNotificacao } from './registrar-notificacao';

/**
 * Notificação de mudança de status (SN-47). O evento é gravado na transação da
 * mudança; o processador decide quem recebe — quem tem a permissão do próximo
 * passo no escopo da planta, mais os envolvidos, menos quem causou — e grava o
 * aviso do sininho e a fila do e-mail. Contra Postgres real.
 */
describe('notificações (banco real)', () => {
  const prisma = new PrismaService();
  const processador = new ProcessadorDeNotificacoes(prisma);
  const servico = new NotificacoesService(prisma);
  const ID = (s: string) => `testenotif${s}`.padEnd(26, '0').slice(0, 26);
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const CLIENTE_A = ID('clientea');
  const CLIENTE_B = ID('clienteb');
  const GERENTE = ID('gerente');
  const GERENTE_INATIVO = ID('gerenteinativo');
  const TECNICO_A = ID('tecnicoa');
  const TECNICO_B = ID('tecnicob');
  const PROG_A = ID('proga');
  const OS_A = ID('osa');
  const PAPEL_GERENTE = 'notif_teste_gerente';
  const USUARIOS = [CLIENTE_A, CLIENTE_B, GERENTE, GERENTE_INATIVO, TECNICO_A, TECNICO_B];

  const papel = (name: string) =>
    prisma.roles.upsert({ where: { name_guard_name: { name, guard_name: 'web' } }, update: {}, create: { name, guard_name: 'web' } });
  const permissao = (name: string) =>
    prisma.permissions.upsert({ where: { name_guard_name: { name, guard_name: 'web' } }, update: {}, create: { name, guard_name: 'web' } });
  const darPapel = async (usuario: string, nome: string) => {
    const r = await papel(nome);
    await prisma.model_has_roles.create({ data: { role_id: r.id, model_id: usuario, model_type: 'App\\Models\\User' } });
  };
  const darPermissao = async (usuario: string, nome: string) => {
    const p = await permissao(nome);
    await prisma.model_has_permissions.create({ data: { permission_id: p.id, model_id: usuario, model_type: 'App\\Models\\User' } });
  };
  const usuario = (id: string, extra: Record<string, unknown> = {}) =>
    prisma.usuarios.create({ data: { id, nome: id, email: `${id}@notif.teste`, status: 'Ativo', is_active: true, ...extra } });
  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `Planta ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });

  const apagar = async () => {
    await prisma.notificacoes.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [PROG_A, OS_A] } } });
    await prisma.notificacoes_preferencias.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
    await prisma.ordens_servico.deleteMany({ where: { id: OS_A } });
    await prisma.programacoes_os.deleteMany({ where: { id: PROG_A } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: USUARIOS } } });
    await prisma.model_has_permissions.deleteMany({ where: { model_id: { in: USUARIOS } } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: USUARIOS } } });
  };

  beforeAll(async () => {
    await apagar();
    for (const id of USUARIOS) await usuario(id, id === GERENTE_INATIVO ? { status: 'Inativo' } : {});
    await planta(PLANTA_A, CLIENTE_A, '81.000.000/0001-01');
    await planta(PLANTA_B, CLIENTE_B, '81.000.000/0001-02');
    // Gerente: papel sem escopo, aprova programação e finaliza OS
    const gerente = await papel(PAPEL_GERENTE);
    for (const nome of ['programacao_os.aprovar', 'execucao_os.aprovar']) {
      const p = await permissao(nome);
      await prisma.role_has_permissions.upsert({
        where: { permission_id_role_id: { permission_id: p.id, role_id: gerente.id } },
        update: {},
        create: { permission_id: p.id, role_id: gerente.id },
      });
    }
    await darPapel(GERENTE, PAPEL_GERENTE);
    await darPapel(GERENTE_INATIVO, PAPEL_GERENTE);
    // Técnicos: escopo pela planta que operam, e executam OS
    for (const [tecnico, plantaDele] of [[TECNICO_A, PLANTA_A], [TECNICO_B, PLANTA_B]]) {
      await darPapel(tecnico, 'operador');
      await darPermissao(tecnico, 'execucao_os.executar');
      await prisma.planta_operadores.create({ data: { usuario_id: tecnico, planta_id: plantaDele } });
    }
    for (const cliente of [CLIENTE_A, CLIENTE_B]) await darPapel(cliente, 'proprietario');

    await prisma.programacoes_os.create({
      data: {
        id: PROG_A, codigo: 'PROG-NOTIF-1', descricao: 'Limpeza dos módulos', condicoes: 'FUNCIONANDO', tipo: 'PREVENTIVA',
        origem: 'MANUAL', tempo_estimado: 1, duracao_estimada: 1, planta_id: PLANTA_A, atualizado_em: new Date(),
      },
    });
    await prisma.ordens_servico.create({
      data: {
        id: OS_A, programacao_id: PROG_A, numero_os: 'OS-NOTIF-1', descricao: 'Limpeza dos módulos', condicoes: 'FUNCIONANDO',
        tipo: 'PREVENTIVA', prioridade: 'MEDIA', origem: 'MANUAL', tempo_estimado: 1, duracao_estimada: 1, planta_id: PLANTA_A,
        atualizado_em: new Date(),
      },
    });
  });

  beforeEach(async () => {
    await prisma.notificacoes.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [PROG_A, OS_A] } } });
    await prisma.notificacoes_preferencias.deleteMany({ where: { usuario_id: { in: USUARIOS } } });
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const avisados = async () =>
    (await prisma.notificacoes.findMany({ where: { usuario_id: { in: USUARIOS } } })).map((n) => n.usuario_id.trim()).sort();
  const disparar = async (evento: Evento, entidade: Entidade, entidadeId: string, atorId?: string) => {
    await registrarNotificacao(prisma, { evento, entidade, entidadeId, atorId });
    await processador.processarPendentes();
  };

  it('programação criada avisa quem aprova, não o técnico nem o inativo', async () => {
    await disparar('programacao.criada', 'programacao_os', PROG_A);

    expect(await avisados()).toEqual([GERENTE]);
  });

  it('quem causou não é avisado', async () => {
    await disparar('programacao.criada', 'programacao_os', PROG_A, GERENTE);

    expect(await avisados()).toEqual([]);
  });

  it('programação aprovada avisa a equipe da planta e não a de outra', async () => {
    await disparar('programacao.aprovada', 'programacao_os', PROG_A, GERENTE);

    expect(await avisados()).toEqual([TECNICO_A]);
  });

  it('OS finalizada avisa o cliente da planta, não o de outra', async () => {
    await disparar('os.finalizada', 'ordem_servico', OS_A, GERENTE);

    expect(await avisados()).toContain(CLIENTE_A);
    expect(await avisados()).not.toContain(CLIENTE_B);
  });

  it('o aviso diz o que aconteceu e leva ao registro', async () => {
    await disparar('programacao.criada', 'programacao_os', PROG_A);

    expect(await prisma.notificacoes.findFirstOrThrow({ where: { usuario_id: GERENTE } })).toMatchObject({
      titulo: expect.stringContaining('PROG-NOTIF-1'),
      link: `/programacao-os?programacaoId=${PROG_A}`,
      evento: 'programacao.criada',
      planta_id: PLANTA_A,
      lida: false,
    });
  });

  it('mudança de status desfeita não deixa evento', async () => {
    await prisma
      .$transaction(async (tx) => {
        await registrarNotificacao(tx, { evento: 'programacao.criada', entidade: 'programacao_os', entidadeId: PROG_A });
        throw new Error('a aprovação falhou');
      })
      .catch(() => undefined);

    expect(await prisma.notificacoes_eventos.count({ where: { entidade_id: PROG_A } })).toBe(0);
  });

  it('o evento é processado uma vez só', async () => {
    await disparar('programacao.criada', 'programacao_os', PROG_A);
    await processador.processarPendentes();

    expect(await prisma.notificacoes.count({ where: { usuario_id: GERENTE } })).toBe(1);
  });

  // Script que sobe o AppModule (povoar, conferir) é um segundo processador no mesmo banco
  it('dois processadores ao mesmo tempo não duplicam o aviso', async () => {
    await registrarNotificacao(prisma, { evento: 'programacao.criada', entidade: 'programacao_os', entidadeId: PROG_A });

    await Promise.all([new ProcessadorDeNotificacoes(prisma).processarPendentes(), new ProcessadorDeNotificacoes(prisma).processarPendentes()]);

    expect(await prisma.notificacoes.count({ where: { usuario_id: GERENTE } })).toBe(1);
    expect(await prisma.notificacoes_envios.count({ where: { notificacao: { usuario_id: GERENTE } } })).toBe(1);
  });

  it('técnico envolvido (responsável) de outra planta não recebe; o da planta recebe', async () => {
    try {
      await prisma.ordens_servico.update({ where: { id: OS_A }, data: { responsavel_id: TECNICO_B } });
      await disparar('os.reaberta', 'ordem_servico', OS_A, GERENTE);
      expect(await avisados()).toEqual([]);

      await prisma.ordens_servico.update({ where: { id: OS_A }, data: { responsavel_id: TECNICO_A } });
      await disparar('os.reaberta', 'ordem_servico', OS_A, GERENTE);
      expect(await avisados()).toEqual([TECNICO_A]);
    } finally {
      await prisma.ordens_servico.update({ where: { id: OS_A }, data: { responsavel_id: null } });
    }
  });

  it('usuário de id antigo (cuid de 25, com espaço no Char(26)) recebe', async () => {
    const antigo = 'ctestenotif25'.padEnd(25, '0');
    try {
      await usuario(antigo);
      await darPapel(antigo, PAPEL_GERENTE);

      await disparar('programacao.criada', 'programacao_os', PROG_A);

      expect(await prisma.notificacoes.count({ where: { usuario_id: antigo } })).toBe(1);
    } finally {
      await prisma.notificacoes.deleteMany({ where: { usuario_id: antigo } });
      await prisma.model_has_roles.deleteMany({ where: { model_id: antigo } });
      await prisma.usuarios.deleteMany({ where: { id: antigo } });
    }
  });

  // Dado legado: dois papéis. Vale o de menor id, como no getUserPermissions —
  // a permissão que só o segundo papel tem não avisa (a tela não deixaria agir)
  it('com dois papéis vale o de menor id: a permissão do segundo não avisa', async () => {
    const duplo = ID('duplo');
    const sufixo = Date.now();
    const valeEste = await papel(`notif_teste_vale_${sufixo}`);
    const segundo = await papel(`notif_teste_segundo_${sufixo}`);
    try {
      expect(valeEste.id < segundo.id).toBe(true);
      const aprovar = await permissao('programacao_os.aprovar');
      await prisma.role_has_permissions.create({ data: { permission_id: aprovar.id, role_id: segundo.id } });
      await usuario(duplo);
      await darPapel(duplo, valeEste.name);
      await darPapel(duplo, segundo.name);

      await disparar('programacao.criada', 'programacao_os', PROG_A);

      expect(await prisma.notificacoes.count({ where: { usuario_id: duplo } })).toBe(0);
    } finally {
      await prisma.notificacoes.deleteMany({ where: { usuario_id: duplo } });
      await prisma.model_has_roles.deleteMany({ where: { model_id: duplo } });
      await prisma.usuarios.deleteMany({ where: { id: duplo } });
      await prisma.role_has_permissions.deleteMany({ where: { role_id: { in: [valeEste.id, segundo.id] } } });
      await prisma.roles.deleteMany({ where: { id: { in: [valeEste.id, segundo.id] } } });
    }
  });

  describe('e-mail', () => {
    const enviosDe = (usuarioId: string) =>
      prisma.notificacoes_envios.findMany({ where: { notificacao: { usuario_id: usuarioId } } });

    it('quem tem de agir recebe por e-mail por padrão; a preferência desliga sem tirar o sininho', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      expect(await enviosDe(GERENTE)).toEqual([expect.objectContaining({ canal: 'email', status: 'pendente', destino: `${GERENTE}@notif.teste` })]);

      await prisma.notificacoes.deleteMany({ where: { usuario_id: GERENTE } });
      await servico.salvarPreferencias(GERENTE, [{ evento: 'programacao.criada', email: false }]);
      await disparar('programacao.criada', 'programacao_os', PROG_A);

      expect(await avisados()).toEqual([GERENTE]);
      expect(await enviosDe(GERENTE)).toEqual([]);
    });

    it('falha no envio tenta de novo depois; na quarta falha fica "falhou" com o motivo', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      const correio = { enviarNotificacao: jest.fn().mockRejectedValue(new Error('SMTP recusou')) };
      const envio = new EnvioDeNotificacoes(prisma, correio);
      // Um segundo atrás: TIMESTAMP(0) arredonda os milissegundos para cima ou para baixo
      const agora = () => new Date(Date.now() - 1000);

      for (let tentativa = 1; tentativa <= 4; tentativa++) {
        await prisma.notificacoes_envios.updateMany({ where: { notificacao: { usuario_id: GERENTE } }, data: { proxima_tentativa: agora() } });
        await envio.enviarPendentes(true);
      }

      const [registro] = await enviosDe(GERENTE);
      expect(registro).toMatchObject({ status: 'falhou', tentativas: 4, erro: 'SMTP recusou' });
      expect(correio.enviarNotificacao).toHaveBeenCalledTimes(4);
    });

    it('a próxima tentativa espera: 1 minuto depois da primeira falha', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      const envio = new EnvioDeNotificacoes(prisma, { enviarNotificacao: jest.fn().mockRejectedValue(new Error('fora do ar')) });
      const antes = Date.now();

      await envio.enviarPendentes(true);

      const [registro] = await enviosDe(GERENTE);
      expect(registro.status).toBe('pendente');
      expect(registro.proxima_tentativa.getTime() - antes).toBeGreaterThanOrEqual(55_000);
    });

    it('com o envio desligado no ambiente, nada sai e fica registrado por quê', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      const correio = { enviarNotificacao: jest.fn() };

      await new EnvioDeNotificacoes(prisma, correio).enviarPendentes(false);

      expect(correio.enviarNotificacao).not.toHaveBeenCalled();
      expect((await enviosDe(GERENTE))[0]).toMatchObject({ status: 'desligado' });
    });

    it('duas filas ao mesmo tempo mandam o e-mail uma vez só', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      const correio = { enviarNotificacao: jest.fn(() => new Promise<void>((ok) => setTimeout(ok, 50))) };

      await Promise.all([new EnvioDeNotificacoes(prisma, correio).enviarPendentes(true), new EnvioDeNotificacoes(prisma, correio).enviarPendentes(true)]);

      expect(correio.enviarNotificacao).toHaveBeenCalledTimes(1);
      expect((await enviosDe(GERENTE))[0]).toMatchObject({ status: 'enviado', tentativas: 1 });
    });

    it('envio que ficou "enviando" (processo caiu no meio) vira "falhou" depois de 30 min, sem reenviar', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      await prisma.notificacoes_envios.updateMany({
        where: { notificacao: { usuario_id: GERENTE } },
        data: { status: 'enviando', proxima_tentativa: new Date(Date.now() - 31 * 60_000) },
      });
      const correio = { enviarNotificacao: jest.fn() };

      await new EnvioDeNotificacoes(prisma, correio).enviarPendentes(true);

      expect(correio.enviarNotificacao).not.toHaveBeenCalled();
      expect((await enviosDe(GERENTE))[0]).toMatchObject({ status: 'falhou', erro: expect.stringContaining('não se sabe') });
    });

    it('enviado com sucesso fica "enviado", com a hora', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      const correio = { enviarNotificacao: jest.fn().mockResolvedValue(undefined) };

      await new EnvioDeNotificacoes(prisma, correio).enviarPendentes(true);

      expect(correio.enviarNotificacao).toHaveBeenCalledWith(`${GERENTE}@notif.teste`, expect.stringContaining('PROG-NOTIF-1'), expect.any(String), `/programacao-os?programacaoId=${PROG_A}`);
      expect((await enviosDe(GERENTE))[0]).toMatchObject({ status: 'enviado', enviado_em: expect.any(Date) });
    });
  });

  describe('limpeza', () => {
    it('apaga evento processado e e-mail resolvido com mais de 90 dias; o pendente e a notificação ficam', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      const daqui100Dias = new Date(Date.now() + 100 * 86_400_000);
      await prisma.notificacoes_envios.updateMany({ where: { notificacao: { usuario_id: GERENTE } }, data: { status: 'enviado' } });
      await registrarNotificacao(prisma, { evento: 'programacao.criada', entidade: 'programacao_os', entidadeId: PROG_A });

      await new LimpezaDeNotificacoes(prisma).limpar(daqui100Dias);

      expect(await prisma.notificacoes_eventos.count({ where: { entidade_id: PROG_A, processado_em: { not: null } } })).toBe(0);
      expect(await prisma.notificacoes_eventos.count({ where: { entidade_id: PROG_A, processado_em: null } })).toBe(1);
      expect(await prisma.notificacoes_envios.count({ where: { notificacao: { usuario_id: GERENTE } } })).toBe(0);
      expect(await prisma.notificacoes.count({ where: { usuario_id: GERENTE } })).toBe(1);
    });
  });

  describe('preferências', () => {
    it('o aviso que só vai à equipe (comentário interno) não aparece nas preferências do cliente', async () => {
      const doCliente = (await servico.preferencias(CLIENTE_A, 'proprietario')).map((p) => p.evento);
      const doGerente = (await servico.preferencias(GERENTE, 'gerente')).map((p) => p.evento);

      expect(doCliente).not.toContain('os.comentario_interno');
      expect(doCliente).toContain('os.comentario');
      expect(doGerente).toContain('os.comentario_interno');
    });
  });

  describe('as minhas notificações', () => {
    it('cada um só vê e marca as próprias', async () => {
      await disparar('programacao.criada', 'programacao_os', PROG_A);
      const [doGerente] = await prisma.notificacoes.findMany({ where: { usuario_id: GERENTE } });

      expect((await servico.listar(TECNICO_A, {})).data).toEqual([]);
      await expect(servico.marcarLida(TECNICO_A, doGerente.id)).rejects.toBeInstanceOf(NotFoundException);

      expect(await servico.contarNaoLidas(GERENTE)).toBe(1);
      await servico.marcarLida(GERENTE, doGerente.id);
      expect(await servico.contarNaoLidas(GERENTE)).toBe(0);
    });

    it('marcar todas como lidas só mexe nas próprias', async () => {
      await disparar('os.finalizada', 'ordem_servico', OS_A, GERENTE);

      await servico.marcarTodasLidas(TECNICO_A);

      expect(await servico.contarNaoLidas(CLIENTE_A)).toBe(1);
      expect(await servico.contarNaoLidas(TECNICO_A)).toBe(0);
    });
  });
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { RolesService } from '../roles/roles.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto, UsuarioStatus } from './dto';
import { Solicitante, podeLidarComPapel } from './hierarquia-de-papeis';

const MODEL_TYPE = 'App\\Models\\User';

describe('podeLidarComPapel', () => {
  const com = (...permissions: string[]): Solicitante => ({ id: 'x', role: 'gerente', permissions });

  it('o papel com permissão própria exige usuarios.create_<papel>', () => {
    expect(podeLidarComPapel(com('usuarios.create_operador'), 'operador', true)).toBe(true);
    expect(podeLidarComPapel(com('usuarios.manage'), 'operador', true)).toBe(false);
  });

  it('o papel sem permissão própria (legado, gerente) exige usuarios.manage', () => {
    expect(podeLidarComPapel(com('usuarios.manage'), 'vendedor', false)).toBe(true);
    expect(podeLidarComPapel(com('usuarios.create_operador'), 'vendedor', false)).toBe(false);
    expect(podeLidarComPapel(com('usuarios.manage'), null, false)).toBe(true);
  });

  it('super_admin só por super_admin, que pode tudo', () => {
    expect(podeLidarComPapel(com('usuarios.manage', 'usuarios.create_admin'), 'super_admin', false)).toBe(false);
    expect(podeLidarComPapel({ id: 'x', role: 'super_admin', permissions: [] }, 'super_admin', false)).toBe(true);
    expect(podeLidarComPapel({ id: 'x', role: 'super_admin', permissions: [] }, 'admin', true)).toBe(true);
  });
});

/**
 * A hierarquia contra Postgres de verdade, porque o que se prova é onde o papel
 * e as permissões vão parar (model_has_roles, model_has_permissions, a coluna
 * legada) e que nada fica gravado quando a regra recusa.
 */
describe('Hierarquia de papéis na gestão de usuários (banco real)', () => {
  const prisma = new PrismaService();
  const correio = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new UsuariosService(
    prisma,
    new RolesService(prisma),
    new PermissionsService(prisma),
    correio as unknown as MailService,
  );

  const DOMINIO = '@hierarquia-papeis.teste';
  const papel: Record<string, bigint> = {};
  const permissao: Record<string, bigint> = {};

  const dono: Solicitante = {
    id: 'testehierdono0000000000001',
    role: 'proprietario',
    permissions: ['usuarios.create_operador'],
  };
  const admin: Solicitante = {
    id: 'testehieradmin000000000001',
    role: 'admin',
    permissions: ['usuarios.manage', 'usuarios.view', 'usuarios.create_operador', 'usuarios.create_proprietario', 'teste_hier.extra'],
  };
  const chefe: Solicitante = { id: 'testehiersuper000000000001', role: 'super_admin', permissions: [] };
  const OUTRO_ADMIN = 'testehieradmin000000000002';
  const OPERADOR = 'testehieroper0000000000001';
  const FIXOS = [dono.id, admin.id, chefe.id, OUTRO_ADMIN, OPERADOR];

  const base = (email: string): CreateUsuarioDto => ({
    nome: 'Fulano de Teste',
    email: `${email}${DOMINIO}`,
    status: UsuarioStatus.ATIVO,
  });

  const papelNoBanco = async (id: string) =>
    (
      await prisma.model_has_roles.findFirst({
        where: { model_id: id, model_type: MODEL_TYPE },
        include: { roles: true },
      })
    )?.roles.name ?? null;

  const diretas = async (id: string) =>
    (
      await prisma.model_has_permissions.findMany({
        where: { model_id: id, model_type: MODEL_TYPE },
        include: { permissions: true },
      })
    )
      .map((p) => p.permissions.name)
      .sort();

  const porEmail = (email: string) => prisma.usuarios.findFirst({ where: { email: `${email}${DOMINIO}` } });

  const comPapel = async (id: string, nome: string, role: string) => {
    await prisma.usuarios.upsert({
      where: { id },
      update: { role, deleted_at: null, status: 'Ativo' },
      create: { id, nome, email: `${id}${DOMINIO}`, role, senha: 'x' },
    });
    await prisma.model_has_roles.deleteMany({ where: { model_id: id, model_type: MODEL_TYPE } });
    await prisma.model_has_roles.create({ data: { model_id: id, model_type: MODEL_TYPE, role_id: papel[role] } });
    await prisma.model_has_permissions.deleteMany({ where: { model_id: id, model_type: MODEL_TYPE } });
  };

  beforeAll(async () => {
    for (const nome of ['operador', 'proprietario', 'admin', 'super_admin']) {
      papel[nome] = (
        await prisma.roles.upsert({
          where: { name_guard_name: { name: nome, guard_name: 'api' } },
          update: {},
          create: { name: nome, guard_name: 'api' },
        })
      ).id;
    }
    for (const nome of [
      'usuarios.create_operador',
      'usuarios.create_proprietario',
      'usuarios.create_admin',
      'teste_hier.ver',
      'teste_hier.extra',
      'teste_hier.secreta',
    ]) {
      permissao[nome] = (
        await prisma.permissions.upsert({
          where: { name_guard_name: { name: nome, guard_name: 'api' } },
          update: {},
          create: { name: nome, guard_name: 'api' },
        })
      ).id;
    }
    await prisma.role_has_permissions.upsert({
      where: { permission_id_role_id: { permission_id: permissao['teste_hier.ver'], role_id: papel.operador } },
      update: {},
      create: { permission_id: permissao['teste_hier.ver'], role_id: papel.operador },
    });
  });

  const limpar = async () => {
    const ids = (await prisma.usuarios.findMany({ where: { email: { endsWith: DOMINIO } } })).map((u) => u.id);
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: ids } } });
    await prisma.model_has_permissions.deleteMany({ where: { model_id: { in: ids } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(async () => {
    await limpar();
    await comPapel(dono.id, 'Dono', 'proprietario');
    await comPapel(admin.id, 'Admin', 'admin');
    await comPapel(chefe.id, 'Chefe', 'super_admin');
    await comPapel(OUTRO_ADMIN, 'Outro admin', 'admin');
    await comPapel(OPERADOR, 'Operador', 'operador');
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  describe('criar', () => {
    it('quem só cria operador não cria admin pelo nome do papel (roleNames)', async () => {
      await expect(service.create({ ...base('a'), roleNames: ['admin'] }, dono)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await porEmail('a')).toBeNull();
    });

    it('nem pelo id do papel (roleId)', async () => {
      await expect(service.create({ ...base('a'), roleId: Number(papel.admin) }, dono)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(await porEmail('a')).toBeNull();
    });

    it('cria operador pelo nome do papel, com o papel no Spatie e na coluna legada', async () => {
      await service.create({ ...base('a'), roleNames: ['operador'] }, dono);

      const u = (await porEmail('a'))!;
      expect(await papelNoBanco(u.id)).toBe('operador');
      expect(u.role).toBe('operador');
      expect(u.created_by?.trim()).toBe(dono.id);
    });

    it('proprietário que não informa o tipo cria operador', async () => {
      await service.create(base('a'), dono);
      expect(await papelNoBanco((await porEmail('a'))!.id)).toBe('operador');
    });

    it('sem tipo, quem não é proprietário recebe erro e nada é criado', async () => {
      await expect(service.create(base('a'), admin)).rejects.toBeInstanceOf(BadRequestException);
      expect(await porEmail('a')).toBeNull();
    });

    it('tipo que não existe é erro, e não um usuário sem papel', async () => {
      await expect(service.create({ ...base('a'), roleNames: ['vendedor'] }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(await porEmail('a')).toBeNull();
    });

    it('as permissões do próprio papel não viram permissão direta', async () => {
      await service.create({ ...base('a'), roleNames: ['operador'], permissions: ['teste_hier.ver'] as never }, dono);
      expect(await diretas((await porEmail('a'))!.id)).toEqual([]);
    });

    it('permissão fora do papel exige usuarios.manage', async () => {
      await expect(
        service.create({ ...base('a'), roleNames: ['operador'], permissions: ['teste_hier.extra'] as never }, dono),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await porEmail('a')).toBeNull();
    });

    it('quem gerencia usuários só dá permissão direta que ele mesmo tem', async () => {
      await service.create({ ...base('a'), roleNames: ['operador'], permissionIds: [Number(permissao['teste_hier.extra'])] }, admin);
      expect(await diretas((await porEmail('a'))!.id)).toEqual(['teste_hier.extra']);

      await expect(
        service.create({ ...base('b'), roleNames: ['operador'], permissions: ['teste_hier.secreta'] as never }, admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await porEmail('b')).toBeNull();
    });

    it('super_admin só é criado por super_admin', async () => {
      const adminComTudo = { ...admin, permissions: [...admin.permissions, 'usuarios.create_admin'] };
      await expect(service.create({ ...base('a'), roleNames: ['super_admin'] }, adminComTudo)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      await service.create({ ...base('a'), roleNames: ['super_admin'] }, chefe);
      expect(await papelNoBanco((await porEmail('a'))!.id)).toBe('super_admin');
    });
  });

  describe('editar', () => {
    it('trocar o tipo exige poder criar o tipo novo', async () => {
      await expect(service.update(OPERADOR, { roleNames: ['admin'] }, admin)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await papelNoBanco(OPERADOR)).toBe('operador');

      await service.update(OPERADOR, { roleNames: ['proprietario'] }, admin);
      expect(await papelNoBanco(OPERADOR)).toBe('proprietario');
    });

    it('quem não tem create_admin não edita um admin, e o motivo chega inteiro', async () => {
      await expect(service.update(OUTRO_ADMIN, { nome: 'Trocado' }, admin)).rejects.toThrow(/admin/);
      expect((await prisma.usuarios.findUnique({ where: { id: OUTRO_ADMIN } }))!.nome).toBe('Outro admin');
    });

    it('a lista de permissões vazia limpa as diretas', async () => {
      await prisma.model_has_permissions.create({
        data: { model_id: OPERADOR, model_type: MODEL_TYPE, permission_id: permissao['teste_hier.extra'] },
      });
      await service.update(OPERADOR, { permissions: [] }, admin);
      expect(await diretas(OPERADOR)).toEqual([]);
    });

    it('tirar uma permissão direta que o editor não tem é permitido; acrescentar, não', async () => {
      await prisma.model_has_permissions.create({
        data: { model_id: OPERADOR, model_type: MODEL_TYPE, permission_id: permissao['teste_hier.secreta'] },
      });

      await expect(
        service.update(OPERADOR, { permissions: ['teste_hier.secreta', 'teste_hier.extra'] as never }, admin),
      ).resolves.toBeDefined();
      expect(await diretas(OPERADOR)).toEqual(['teste_hier.extra', 'teste_hier.secreta']);

      await service.update(OPERADOR, { permissions: ['teste_hier.extra'] as never }, admin);
      expect(await diretas(OPERADOR)).toEqual(['teste_hier.extra']);

      await expect(
        service.update(OPERADOR, { permissions: ['teste_hier.extra', 'teste_hier.secreta'] as never }, admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ninguém muda o próprio tipo nem as próprias permissões', async () => {
      await expect(service.update(admin.id, { roleNames: ['operador'] }, admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.update(admin.id, { permissions: ['teste_hier.extra'] as never }, admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.update(admin.id, { nome: 'Eu mesmo', roleNames: ['admin'] }, admin)).resolves.toBeDefined();
    });
  });

  describe('senha e foto', () => {
    it('redefinir a senha de outro exige poder lidar com o tipo dele', async () => {
      await expect(service.resetPassword(OUTRO_ADMIN, { novaSenha: 'Nova12345!', confirmarSenha: 'Nova12345!' }, dono)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.resetPassword(OPERADOR, { novaSenha: 'Nova12345!', confirmarSenha: 'Nova12345!' }, admin)).resolves.toBeDefined();
    });

    it('trocar a senha (com a senha atual) só a própria', async () => {
      await expect(
        service.changePassword(OPERADOR, { senhaAtual: 'x', novaSenha: 'Nova12345!' }, admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a foto de outra pessoa só com quem pode gerenciar o tipo dela', async () => {
      await expect(service.updateAvatar(OUTRO_ADMIN, 'avatar.png', dono)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('perfil e rotas próprias de papel', () => {
    it('o perfil muda os dados do próprio usuário sem tocar no tipo nem no status', async () => {
      await prisma.usuarios.update({ where: { id: OPERADOR }, data: { status: 'Inativo' } });

      await service.atualizarPerfil(OPERADOR, { nome: 'Novo nome', telefone: '62999998888' });

      const u = (await prisma.usuarios.findUnique({ where: { id: OPERADOR } }))!;
      expect(u).toMatchObject({ nome: 'Novo nome', telefone: '62999998888', status: 'Inativo' });
      expect(await papelNoBanco(OPERADOR)).toBe('operador');
    });

    it('atribuir papel pela rota própria segue a mesma hierarquia', async () => {
      await expect(service.atribuirPapel(OPERADOR, Number(papel.admin), admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.atribuirPapel(OUTRO_ADMIN, Number(papel.operador), admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await service.atribuirPapel(OPERADOR, Number(papel.proprietario), admin);
      expect(await papelNoBanco(OPERADOR)).toBe('proprietario');
    });

    it('sincronizar permissões pela rota própria segue a mesma regra das diretas', async () => {
      await expect(
        service.sincronizarPermissoesDiretas(OPERADOR, [Number(permissao['teste_hier.secreta'])], admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await service.sincronizarPermissoesDiretas(OPERADOR, [Number(permissao['teste_hier.extra'])], admin);
      expect(await diretas(OPERADOR)).toEqual(['teste_hier.extra']);
    });
  });
});

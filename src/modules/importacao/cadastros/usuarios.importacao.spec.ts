import { MailService, PermissionsService, PrismaService, RolesService, UsuariosService } from '@/core';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { UsuariosImportacao } from './usuarios.importacao';

/**
 * Usuários pela planilha — contra Postgres de verdade, porque o que se prova é
 * onde o papel e as permissões vão parar (model_has_roles,
 * model_has_permissions) e que o e-mail de boas-vindas não sai na prévia.
 */
describe('Importação de usuários (banco real)', () => {
  const prisma = new PrismaService();
  const correio = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new UsuariosService(
    prisma,
    new RolesService(prisma),
    new PermissionsService(prisma),
    correio as unknown as MailService,
  );
  const importacao = new ImportacaoService(prisma);
  const usuarios = new UsuariosImportacao(service, prisma);

  const DOMINIO = '@importacao-usuarios.teste';
  const PROPRIETARIO = 'testeimpusuproprietario01';
  let operadorId: bigint;
  let permissaoDoOperador: bigint;

  const admin: UsuarioDaImportacao = {
    id: 'testeimpusuadmin000000001',
    role: 'admin',
    permissions: ['usuarios.manage', 'usuarios.create_operador', 'usuarios.create_admin'],
  };

  beforeAll(async () => {
    const papel = (name: string) =>
      prisma.roles.upsert({
        where: { name_guard_name: { name, guard_name: 'api' } },
        update: {},
        create: { name, guard_name: 'api' },
      });
    operadorId = (await papel('operador')).id;
    await papel('admin');
    // A hierarquia só cobra usuarios.create_<papel> se ela existe no catálogo.
    for (const name of ['usuarios.create_operador', 'usuarios.create_admin']) {
      await prisma.permissions.upsert({
        where: { name_guard_name: { name, guard_name: 'api' } },
        update: {},
        create: { name, guard_name: 'api' },
      });
    }
    permissaoDoOperador = (
      await prisma.permissions.upsert({
        where: { name_guard_name: { name: 'teste_importacao.ver', guard_name: 'api' } },
        update: {},
        create: { name: 'teste_importacao.ver', guard_name: 'api' },
      })
    ).id;
    await prisma.role_has_permissions.upsert({
      where: { permission_id_role_id: { permission_id: permissaoDoOperador, role_id: operadorId } },
      update: {},
      create: { permission_id: permissaoDoOperador, role_id: operadorId },
    });
    await prisma.usuarios.upsert({
      where: { id: admin.id },
      update: { role: 'admin', deleted_at: null },
      create: { id: admin.id, nome: 'Admin', email: `admin${DOMINIO}`, role: 'admin' },
    });
    await prisma.usuarios.upsert({
      where: { id: PROPRIETARIO },
      update: { role: 'proprietario', deleted_at: null },
      create: { id: PROPRIETARIO, nome: 'Prop', email: `prop${DOMINIO}`, role: 'proprietario' },
    });
  });

  const limpar = async () => {
    const ids = (await prisma.usuarios.findMany({ where: { email: { endsWith: DOMINIO }, id: { notIn: [PROPRIETARIO, admin.id] } } })).map(
      (u) => u.id,
    );
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: ids } } });
    await prisma.model_has_permissions.deleteMany({ where: { model_id: { in: ids } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(async () => {
    await limpar();
    correio.sendWelcomeEmail.mockClear();
  });
  afterAll(async () => {
    await limpar();
    await prisma.usuarios.deleteMany({ where: { id: { in: [PROPRIETARIO, admin.id] } } });
    await prisma.$disconnect();
  });

  const linha = (dados: Record<string, unknown> = {}, id: string | null = null): RegistroImportado => ({
    id,
    aba: 'RESUMO',
    linha: 2,
    atualizado_em: null,
    dados: {
      nome: 'Fulano de Teste',
      email: `fulano${DOMINIO}`,
      status: 'Ativo',
      tipo: 'operador',
      telefone: null,
      cpfCnpj: null,
      cep: null,
      estado: null,
      cidade: null,
      endereco: null,
      ...dados,
    },
  });

  const doBanco = () => prisma.usuarios.findFirst({ where: { email: `fulano${DOMINIO}` } });

  it('a prévia não cria o usuário nem manda o e-mail de boas-vindas', async () => {
    const r = await importacao.importar(usuarios, [linha()], false, admin);

    expect(r).toMatchObject({ novos: 1, erros: [] });
    expect(await doBanco()).toBeNull();
    expect(correio.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('confirmar cria com o papel (as permissões vêm dele, sem cópia direta), e só então manda o e-mail', async () => {
    const r = await importacao.importar(usuarios, [linha()], true, admin);

    expect(r).toMatchObject({ confirmado: true, novos: 1 });
    const u = (await doBanco())!;
    const papel = await prisma.model_has_roles.findFirst({ where: { model_id: u.id } });
    const diretas = await prisma.model_has_permissions.findMany({ where: { model_id: u.id } });
    expect(papel?.role_id).toBe(operadorId);
    expect(diretas).toEqual([]);
    expect(correio.sendWelcomeEmail).toHaveBeenCalledWith(`fulano${DOMINIO}`, 'Fulano de Teste', expect.any(String));
  });

  it('dar um tipo exige poder criar usuário daquele tipo', async () => {
    const semAdmin = { ...admin, permissions: ['usuarios.manage', 'usuarios.create_operador'] };

    const r = await importacao.importar(usuarios, [linha({ tipo: 'admin' })], true, semAdmin);

    expect(r.confirmado).toBe(false);
    expect(r.erros[0]).toMatchObject({ campo: 'tipo', mensagem: expect.stringContaining('usuarios.create_admin') });
    expect(await doBanco()).toBeNull();
  });

  it('trocar o tipo de quem existe avisa e não mexe nas permissões diretas', async () => {
    await importacao.importar(usuarios, [linha()], true, admin);
    const id = (await doBanco())!.id.trim();
    await prisma.model_has_permissions.create({
      data: { model_id: id, model_type: 'App\\Models\\User', permission_id: permissaoDoOperador },
    });

    const r = await importacao.importar(usuarios, [linha({ tipo: 'admin' }, id)], true, admin);

    expect(r.alterados).toBe(1);
    expect(r.avisos[0].mensagem).toContain('As permissões diretas dele ficam como estão');
    const diretas = await prisma.model_has_permissions.findMany({ where: { model_id: id } });
    expect(diretas.map((d) => d.permission_id)).toEqual([permissaoDoOperador]);
  });

  it('reimportar sem mexer não muda nada — nem com papel legado que não existe mais', async () => {
    await importacao.importar(usuarios, [linha()], true, admin);
    const id = (await doBanco())!.id.trim();
    await prisma.model_has_roles.deleteMany({ where: { model_id: id } });
    await prisma.usuarios.update({ where: { id }, data: { role: 'vendedor' } });

    const r = await importacao.importar(usuarios, [linha({ tipo: 'vendedor' }, id)], true, admin);

    expect(r).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
  });

  it('dado antigo fora da regra de hoje não trava a linha; inativo continua inativo', async () => {
    await importacao.importar(usuarios, [linha()], true, admin);
    const id = (await doBanco())!.id.trim();
    await prisma.usuarios.update({ where: { id }, data: { telefone: '1234', status: 'Inativo' } });

    const semMexer = await importacao.importar(
      usuarios,
      [linha({ telefone: '1234', status: 'Inativo' }, id)],
      true,
      admin,
    );
    expect(semMexer).toMatchObject({ inalterados: 1, erros: [] });

    const outroCampo = await importacao.importar(
      usuarios,
      [linha({ telefone: '1234', status: 'Inativo', cidade: 'Goiânia' }, id)],
      true,
      admin,
    );
    expect(outroCampo).toMatchObject({ alterados: 1, erros: [] });
    expect(await doBanco()).toMatchObject({ telefone: '1234', status: 'Inativo', cidade: 'Goiânia' });

    const telefoneNovoCurto = await importacao.importar(
      usuarios,
      [linha({ telefone: '5678', status: 'Inativo', cidade: 'Goiânia' }, id)],
      false,
      admin,
    );
    expect(telefoneNovoCurto.erros[0].mensagem).toBe('telefone deve ter ao menos 10 caracteres.');
  });

  it('proprietário não enxerga usuário que não criou: é "não encontrado"', async () => {
    await importacao.importar(usuarios, [linha()], true, admin);
    const id = (await doBanco())!.id.trim();
    const proprietario: UsuarioDaImportacao = {
      id: PROPRIETARIO,
      role: 'proprietario',
      permissions: ['usuarios.manage', 'usuarios.create_operador'],
    };

    const r = await importacao.importar(usuarios, [linha({ nome: 'Invadido' }, id)], true, proprietario);

    expect(r.erros[0]).toMatchObject({ campo: 'id', mensagem: expect.stringContaining('Não existe usuário com o ID') });
    expect((await doBanco())!.nome).toBe('Fulano de Teste');
  });
});

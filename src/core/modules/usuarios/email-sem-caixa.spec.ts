import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { RolesService } from '../roles/roles.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UsuarioStatus } from './dto';
import { UsuariosService } from './usuarios.service';

/**
 * O e-mail é o login, e `Ana@` e `ana@` são a mesma pessoa (SN-46). O banco
 * aceitava os dois como contas diferentes e o login comparava o texto exato:
 * quem digitava com outra caixa recebia "email ou senha inválidos". O DTO já
 * põe em minúsculas; o service compara sem caixa também, para o que chega por
 * outro caminho (sincronização, dado antigo de produção antes do saneamento).
 */
describe('e-mail sem caixa (banco real)', () => {
  const prisma = new PrismaService();
  const correio = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new UsuariosService(prisma, new RolesService(prisma), new PermissionsService(prisma), correio as unknown as MailService);
  const DOMINIO = '@email-sem-caixa.teste';
  const chefe = { id: 'testeemailsemcaixachefe001', role: 'super_admin', permissions: [] as string[] };

  const limpar = async () => {
    const ids = (await prisma.usuarios.findMany({ where: { email: { endsWith: DOMINIO, mode: 'insensitive' } } })).map((u) => u.id);
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: ids } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: ids } } });
  };
  const usuario = (id: string, email: string) => prisma.usuarios.create({ data: { id, nome: 'Fulano', email } });

  beforeAll(async () => {
    await prisma.usuarios.upsert({ where: { id: chefe.id }, update: {}, create: { id: chefe.id, nome: 'Chefe', email: 'chefe@email-sem-caixa-fixo.teste' } });
    await prisma.roles.upsert({ where: { name_guard_name: { name: 'operador', guard_name: 'api' } }, update: {}, create: { name: 'operador', guard_name: 'api' } });
  });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.usuarios.deleteMany({ where: { id: chefe.id } });
    await prisma.$disconnect();
  });

  it('o login acha a conta com o e-mail em outra caixa', async () => {
    await usuario('testeemailsemcaixaana00001', `ana${DOMINIO}`);

    expect(await service.findByEmail(` ANA${DOMINIO.toUpperCase()} `)).toMatchObject({ id: 'testeemailsemcaixaana00001' });
  });

  it('criar com um e-mail que só muda a caixa: 409', async () => {
    await usuario('testeemailsemcaixaana00001', `ana${DOMINIO}`);

    await expect(
      service.create({ nome: 'Outra Ana', email: `Ana${DOMINIO}`, status: UsuarioStatus.ATIVO, roleNames: ['operador'] }, chefe),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('trocar o e-mail para o de outra pessoa com outra caixa: 409', async () => {
    await usuario('testeemailsemcaixaana00001', `ana${DOMINIO}`);
    await usuario('testeemailsemcaixabia00001', `bia${DOMINIO}`);

    await expect(service.update('testeemailsemcaixabia00001', { email: `ANA${DOMINIO}` }, chefe)).rejects.toBeInstanceOf(ConflictException);
  });

  // O mode: 'insensitive' do Prisma vira ILIKE sem escapar: % e _ no e-mail
  // eram curinga. O login e o "esqueci" achavam conta sem saber o endereço, e
  // cada padrão escapava do contador por conta do SN-38 (revisão de segurança).
  it('curinga no e-mail não acha a conta de ninguém', async () => {
    await usuario('testeemailsemcaixaana00001', `ana${DOMINIO}`);

    expect(await service.findByEmail(`%${DOMINIO}`)).toBeNull();
    expect(await service.findByEmail(`an_${DOMINIO}`)).toBeNull();
  });

  it('e-mail com _ não dá 409 falso por outro parecido', async () => {
    await usuario('testeemailsemcaixaaba00001', `aba${DOMINIO}`);

    await expect(
      service.create({ nome: 'A_A', email: `a_a${DOMINIO}`, status: UsuarioStatus.ATIVO, roleNames: ['operador'] }, chefe),
    ).resolves.toMatchObject({ email: `a_a${DOMINIO}` });
  });

  it('perfil: trocar o próprio e-mail para o de outra pessoa com outra caixa: 409', async () => {
    await usuario('testeemailsemcaixaana00001', `ana${DOMINIO}`);
    await usuario('testeemailsemcaixabia00001', `bia${DOMINIO}`);

    await expect(service.atualizarPerfil('testeemailsemcaixabia00001', { email: `ANA${DOMINIO}` })).rejects.toBeInstanceOf(ConflictException);
  });

  // O índice usuarios_email_lower_unique só existe no SQL (o Prisma não modela
  // índice por expressão). Um aupus_test refeito sem ele passaria pelos testes
  // acima, que conferem o service: este confere o banco.
  it('o banco recusa a mesma conta com outra caixa (índice sem caixa)', async () => {
    await usuario('testeemailsemcaixaana00001', `ana${DOMINIO}`);

    await expect(usuario('testeemailsemcaixaana00002', `ANA${DOMINIO}`)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a busca da lista acha o telefone em E.164 pelo número com máscara', async () => {
    await prisma.usuarios.create({ data: { id: 'testeemailsemcaixatel00001', nome: 'Com telefone', email: `tel${DOMINIO}`, telefone: '+5562998887766' } });

    const { data } = await service.findAll({ search: '(62) 99888-7766', page: 1, limit: 10 } as never);

    expect(data.map((u: { id: string }) => u.id.trim())).toContain('testeemailsemcaixatel00001');
  });
});

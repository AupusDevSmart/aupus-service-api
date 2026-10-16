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
});

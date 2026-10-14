import * as bcrypt from 'bcryptjs';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { RolesService } from '../roles/roles.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UsuariosService } from './usuarios.service';
import { UsuarioStatus } from './dto';
import { TrocaDeSenhaGuard, LIBERADO_SEM_TROCAR_SENHA } from '../auth/guards/troca-de-senha.guard';

/**
 * Senha provisória e troca obrigatória no primeiro acesso (SN-34). Antes todo
 * usuário nascia com "Aupus123!", a tela mostrava essa senha e a troca que ela
 * prometia não existia.
 */
describe('troca de senha obrigatória', () => {
  describe('usuário (banco real)', () => {
    const prisma = new PrismaService();
    const correio = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new UsuariosService(prisma, new RolesService(prisma), new PermissionsService(prisma), correio as unknown as MailService);
    const DOMINIO = '@troca-de-senha.teste';
    const chefe = { id: 'testetrocasenhachefe000001', role: 'super_admin', permissions: [] as string[] };

    const limpar = async () => {
      const ids = (await prisma.usuarios.findMany({ where: { email: { endsWith: DOMINIO } } })).map((u) => u.id);
      await prisma.model_has_roles.deleteMany({ where: { model_id: { in: ids } } });
      await prisma.usuarios.deleteMany({ where: { id: { in: ids } } });
    };
    beforeAll(async () => {
      await prisma.usuarios.upsert({ where: { id: chefe.id }, update: {}, create: { id: chefe.id, nome: 'Chefe', email: 'chefe@troca-de-senha-fixo.teste' } });
      await prisma.roles.upsert({ where: { name_guard_name: { name: 'operador', guard_name: 'api' } }, update: {}, create: { name: 'operador', guard_name: 'api' } });
    });
    beforeEach(async () => {
      await limpar();
      correio.sendWelcomeEmail.mockClear();
    });
    afterAll(async () => {
      await limpar();
      await prisma.usuarios.deleteMany({ where: { id: chefe.id } });
      await prisma.$disconnect();
    });

    const criar = (email: string) =>
      service.create({ nome: 'Fulano', email: `${email}${DOMINIO}`, status: UsuarioStatus.ATIVO, roleNames: ['operador'] }, chefe);
    const doBanco = (email: string) => prisma.usuarios.findFirstOrThrow({ where: { email: `${email}${DOMINIO}` } });

    it('usuário novo recebe senha provisória própria (não a padrão) e fica marcado para trocar', async () => {
      const a = (await criar('a')) as unknown as { senhaTemporaria: string; deve_trocar_senha: boolean };
      const b = (await criar('b')) as unknown as { senhaTemporaria: string };

      expect(a.senhaTemporaria).not.toBe('Aupus123!');
      expect(a.senhaTemporaria).not.toBe(b.senhaTemporaria);
      expect(a.senhaTemporaria.length).toBeGreaterThanOrEqual(10);
      const salvo = await doBanco('a');
      expect(await bcrypt.compare(a.senhaTemporaria, salvo.senha!)).toBe(true);
      expect(salvo.deve_trocar_senha).toBe(true);
      expect(a.deve_trocar_senha).toBe(true);
      expect(correio.sendWelcomeEmail).toHaveBeenCalledWith(`a${DOMINIO}`, 'Fulano', a.senhaTemporaria);
    });

    it('trocar a própria senha tira a marca', async () => {
      const criado = (await criar('a')) as unknown as { id: string; senhaTemporaria: string };
      const eu = { id: criado.id, role: 'operador', permissions: [] as string[] };

      await service.changePassword(criado.id, { senhaAtual: criado.senhaTemporaria, novaSenha: 'MinhaNova#2026' } as never, eu);

      expect((await doBanco('a')).deve_trocar_senha).toBe(false);
    });

    it('a nova senha não pode repetir a atual nem voltar à padrão antiga', async () => {
      const criado = (await criar('a')) as unknown as { id: string; senhaTemporaria: string };
      const eu = { id: criado.id, role: 'operador', permissions: [] as string[] };

      await expect(service.changePassword(criado.id, { senhaAtual: criado.senhaTemporaria, novaSenha: criado.senhaTemporaria } as never, eu)).rejects.toThrow(/diferente/);
      await expect(service.changePassword(criado.id, { senhaAtual: criado.senhaTemporaria, novaSenha: 'Aupus123!' } as never, eu)).rejects.toThrow(/padrão/);
      expect((await doBanco('a')).deve_trocar_senha).toBe(true);
    });

    it('senha redefinida por outra pessoa volta a exigir a troca', async () => {
      const criado = (await criar('a')) as unknown as { id: string; senhaTemporaria: string };
      await prisma.usuarios.update({ where: { id: criado.id }, data: { deve_trocar_senha: false } });

      await service.resetPassword(criado.id, { novaSenha: 'Provisoria#2026', confirmarSenha: 'Provisoria#2026' }, chefe);

      expect((await doBanco('a')).deve_trocar_senha).toBe(true);
    });
  });

  describe('TrocaDeSenhaGuard', () => {
    const guard = new TrocaDeSenhaGuard(new Reflector());
    class Rotas {
      qualquer() {}
      liberada() {}
    }
    Reflect.defineMetadata(LIBERADO_SEM_TROCAR_SENHA, true, Rotas.prototype.liberada);
    const contexto = (handler: () => void, user?: { deve_trocar_senha?: boolean }) =>
      ({
        getHandler: () => handler,
        getClass: () => Rotas,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;

    it('quem precisa trocar a senha não passa das rotas liberadas', () => {
      expect(() => guard.canActivate(contexto(Rotas.prototype.qualquer, { deve_trocar_senha: true }))).toThrow(ForbiddenException);
      expect(guard.canActivate(contexto(Rotas.prototype.liberada, { deve_trocar_senha: true }))).toBe(true);
    });

    it('quem já trocou, ou rota sem usuário (pública), passa', () => {
      expect(guard.canActivate(contexto(Rotas.prototype.qualquer, { deve_trocar_senha: false }))).toBe(true);
      expect(guard.canActivate(contexto(Rotas.prototype.qualquer, undefined))).toBe(true);
    });
  });
});

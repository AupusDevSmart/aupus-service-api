import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { MailService } from '../../mail/mail.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';

/**
 * O login não diz quem existe (SN-38, revisão de segurança). Antes, conta
 * inativa respondia 403 e conta sem senha 400 ANTES de conferir a senha, e
 * e-mail inexistente respondia sem rodar o bcrypt: a mensagem e o tempo de
 * resposta contavam quais e-mails eram contas ativas, e o limite por IP só
 * desacelerava a varredura.
 */
describe('validateUser não diz quem existe', () => {
  const HASH = bcrypt.hashSync('SenhaCerta1', 4);
  const ativa = { id: 'u1', email: 'ana@teste.com', senha: HASH, status: 'Ativo', is_active: true, deleted_at: null };
  const findByEmail = jest.fn();
  const auth = new AuthService({ findByEmail } as unknown as UsuariosService, {} as JwtService, {} as PrismaService, {} as MailService);

  const tentar = (senha: string) => auth.validateUser('ana@teste.com', senha);
  const recusa = async (promessa: Promise<unknown>) => {
    const erro = await promessa.then(() => null, (e: unknown) => e);
    return erro instanceof Error ? [erro.constructor.name, erro.message] : erro;
  };

  beforeEach(() => findByEmail.mockReset());
  afterEach(() => jest.restoreAllMocks());

  it('e-mail que não existe, conta sem senha e senha errada dão o mesmo 401', async () => {
    findByEmail.mockResolvedValueOnce(null);
    const naoExiste = await recusa(tentar('qualquer1'));
    findByEmail.mockResolvedValueOnce({ ...ativa, senha: null });
    const semSenha = await recusa(tentar('qualquer1'));
    findByEmail.mockResolvedValueOnce(ativa);
    const senhaErrada = await recusa(tentar('qualquer1'));

    expect(naoExiste).toEqual([UnauthorizedException.name, 'Email ou senha inválidos']);
    expect(semSenha).toEqual(naoExiste);
    expect(senhaErrada).toEqual(naoExiste);
  });

  it('conta que não existe também passa pelo bcrypt (o tempo não denuncia)', async () => {
    const comparar = jest.spyOn(bcrypt, 'compare');
    findByEmail.mockResolvedValueOnce(null);

    await recusa(tentar('qualquer1'));

    expect(comparar).toHaveBeenCalledTimes(1);
  });

  it('conta inativa só é dita inativa para quem acertou a senha', async () => {
    const inativa = { ...ativa, status: 'Inativo' };
    findByEmail.mockResolvedValueOnce(inativa);
    expect(await recusa(tentar('errada123'))).toEqual([UnauthorizedException.name, 'Email ou senha inválidos']);

    findByEmail.mockResolvedValueOnce(inativa);
    expect((await recusa(tentar('SenhaCerta1')) as string[])[0]).toBe(ForbiddenException.name);
  });

  it('senha certa de conta ativa entra, sem a senha no retorno', async () => {
    findByEmail.mockResolvedValueOnce(ativa);

    const usuario = await tentar('SenhaCerta1');

    expect(usuario).toMatchObject({ id: 'u1' });
    expect(usuario).not.toHaveProperty('senha');
  });
});

/**
 * Redefinir a senha segue a regra do "esqueci" (SN-46, revisão de segurança):
 * conta excluída ou inativa não troca a senha, mesmo com um token emitido
 * enquanto ela estava ativa. O findByEmail sem caixa pode devolver a excluída.
 */
describe('resetPassword só de conta ativa', () => {
  const tokens = { findUnique: jest.fn(), delete: jest.fn() };
  const findByEmail = jest.fn();
  const auth = new AuthService(
    { findByEmail } as unknown as UsuariosService,
    {} as JwtService,
    { password_reset_tokens: tokens } as unknown as PrismaService,
    {} as MailService,
  );
  const pedido = { email: 'ana@teste.com', token: 't', novaSenha: 'NovaSenha1', confirmarSenha: 'NovaSenha1' };

  it.each([
    ['excluída', { status: 'Ativo', is_active: true, deleted_at: new Date() }],
    ['inativa', { status: 'Inativo', is_active: true, deleted_at: null }],
  ])('conta %s: token inválido, sem chegar ao token', async (_caso, estado) => {
    findByEmail.mockResolvedValueOnce({ id: 'u1', email: 'ana@teste.com', ...estado });

    await expect(auth.resetPassword(pedido)).rejects.toBeInstanceOf(BadRequestException);
    expect(tokens.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * As contas que ainda usavam a senha padrão antiga tiveram a senha anulada no
 * deploy de 23/out/2026 e entram pelo "esqueci a senha": a redefinição não pode
 * aceitar de volta a senha que está no repositório público, e quem escolheu a
 * senha pelo e-mail não é forçado a trocá-la de novo.
 */
describe('resetPassword: senha padrão antiga e troca obrigatória', () => {
  const montar = () => {
    const tokens = {
      findUnique: jest.fn().mockResolvedValue({ email: 'ana@teste.com', token: bcrypt.hashSync('t', 4), created_at: new Date() }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const usuarios = { update: jest.fn().mockResolvedValue(undefined) };
    const findByEmail = jest.fn().mockResolvedValue({ id: 'u1', email: 'ana@teste.com', status: 'Ativo', is_active: true, deleted_at: null });
    const auth = new AuthService(
      { findByEmail } as unknown as UsuariosService,
      {} as JwtService,
      { password_reset_tokens: tokens, usuarios } as unknown as PrismaService,
      {} as MailService,
    );
    return { auth, tokens, usuarios };
  };

  it('recusa a senha padrão antiga e o token continua valendo', async () => {
    const { auth, tokens, usuarios } = montar();
    const pedido = { email: 'ana@teste.com', token: 't', novaSenha: 'Aupus123!', confirmarSenha: 'Aupus123!' };
    await expect(auth.resetPassword(pedido)).rejects.toThrow('Essa era a senha padrão de todos os usuários');
    expect(usuarios.update).not.toHaveBeenCalled();
    expect(tokens.delete).not.toHaveBeenCalled();
  });

  it('grava a senha nova e desliga a troca obrigatória', async () => {
    const { auth, usuarios } = montar();
    await auth.resetPassword({ email: 'ana@teste.com', token: 't', novaSenha: 'NovaSenha1', confirmarSenha: 'NovaSenha1' });
    expect(usuarios.update.mock.calls[0][0].data).toMatchObject({ deve_trocar_senha: false });
  });
});

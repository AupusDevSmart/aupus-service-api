import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
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

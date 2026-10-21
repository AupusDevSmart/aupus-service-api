import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';

/**
 * O `.catch(() => null)` do /auth/me e do "esqueci a senha" engolia qualquer
 * erro: uma queda do banco virava 401 "Usuário não encontrado" ou o 200 de
 * "enviaremos as instruções" (e o e-mail nunca chegava). Com os `console.log`
 * tirados no SN-89, nem uma linha ficava no log. Só o "não existe" é o caminho
 * calado; o resto aparece.
 */
describe('auth: falha do banco não vira "usuário não encontrado"', () => {
  const findOne = jest.fn();
  const findByEmail = jest.fn();
  const auth = new AuthService({ findOne, findByEmail } as unknown as UsuariosService, {} as JwtService, {} as PrismaService, {} as MailService);

  beforeEach(() => {
    findOne.mockReset();
    findByEmail.mockReset();
  });

  it('/auth/me de quem não existe: 401', async () => {
    findOne.mockRejectedValueOnce(new NotFoundException('Usuário não encontrado'));
    await expect(auth.getCurrentUser('id-que-nao-existe')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('/auth/me com o banco fora: o erro do banco, não 401', async () => {
    findOne.mockRejectedValueOnce(new Error('Can\'t reach database server'));
    await expect(auth.getCurrentUser('id')).rejects.toThrow("Can't reach database server");
  });

  it('esqueci a senha com o banco fora: o erro aparece, não o "enviaremos"', async () => {
    findByEmail.mockRejectedValueOnce(new BadRequestException('Erro ao buscar usuário por email'));
    await expect(auth.forgotPassword({ email: 'alguem@exemplo.com' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('esqueci a senha de quem não existe: a mesma resposta genérica de sempre', async () => {
    findByEmail.mockResolvedValueOnce(null);
    await expect(auth.forgotPassword({ email: 'ninguem@exemplo.com' })).resolves.toEqual({
      message: 'Se o email estiver cadastrado, enviaremos as instruções de redefinição.',
    });
  });
});

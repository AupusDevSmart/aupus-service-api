import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { exceptionFactoryEmPortugues } from '../pipes/mensagens-validacao';
import { CreateUsuarioDto } from '../../core/modules/usuarios/dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../core/modules/usuarios/dto/update-usuario.dto';
import { AtualizarPerfilDto } from '../../core/modules/usuarios/dto/atualizar-perfil.dto';
import { LoginDto } from '../../core/modules/auth/dto/login.dto';
import { ForgotPasswordDto } from '../../core/modules/auth/dto/forgot-password.dto';
import { ResetPasswordWithTokenDto } from '../../core/modules/auth/dto/reset-password.dto';

/**
 * Telefone e e-mail chegam padronizados por qualquer porta (SN-46): pelo mesmo
 * pipe do main.ts, o DTO grava o telefone em E.164 e o e-mail em minúsculas,
 * e recusa o que não é telefone com mensagem em português.
 */
describe('contato pelos DTOs', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: exceptionFactoryEmPortugues,
  });
  const corpo = <T>(metatype: new () => T, dados: Record<string, unknown>) =>
    pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;
  const mensagens = async (promessa: Promise<unknown>) => {
    const erro = await promessa.then(() => null, (e: unknown) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    return JSON.stringify((erro as BadRequestException).getResponse());
  };

  it('usuário novo: telefone com máscara vira E.164 e o e-mail perde a caixa', async () => {
    const dto = await corpo(CreateUsuarioDto, { nome: 'Ana', email: ' Ana@Empresa.COM ', telefone: '(62) 99999-8888' });

    expect(dto).toMatchObject({ email: 'ana@empresa.com', telefone: '+5562999998888' });
  });

  it('telefone que não é telefone: 400 dizendo o formato', async () => {
    const texto = await mensagens(corpo(CreateUsuarioDto, { nome: 'Ana', email: 'ana@empresa.com', telefone: 'werwe' }));

    expect(texto).toContain('Telefone inválido');
  });

  it('telefone vazio quer dizer sem telefone', async () => {
    expect(await corpo(UpdateUsuarioDto, { telefone: '' })).toMatchObject({ telefone: null });
  });

  it('edição e perfil seguem a mesma regra', async () => {
    expect(await corpo(UpdateUsuarioDto, { telefone: '62999998888' })).toMatchObject({ telefone: '+5562999998888' });
    expect(await corpo(AtualizarPerfilDto, { telefone: '6233334444' })).toMatchObject({ telefone: '+556233334444' });
  });

  it('login, esqueci e redefinir aceitam o e-mail com outra caixa e espaço', async () => {
    expect(await corpo(LoginDto, { email: ' ANA@Empresa.com', senha: 'segredo1' })).toMatchObject({ email: 'ana@empresa.com' });
    expect(await corpo(ForgotPasswordDto, { email: 'Ana@Empresa.com ' })).toMatchObject({ email: 'ana@empresa.com' });
    expect(
      await corpo(ResetPasswordWithTokenDto, { email: 'ANA@EMPRESA.COM', token: 't', novaSenha: 'NovaSenha1', confirmarSenha: 'NovaSenha1' }),
    ).toMatchObject({ email: 'ana@empresa.com' });
  });
});

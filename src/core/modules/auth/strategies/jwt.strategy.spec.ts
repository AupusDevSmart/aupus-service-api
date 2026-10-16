import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { segredoDoJwt } from '../segredo-do-jwt';
import type { UsuariosService } from '../../usuarios/usuarios.service';

const config = (segredo?: string) => ({ get: () => segredo }) as unknown as ConfigService;

describe('segredoDoJwt', () => {
  it('sem JWT_SECRET a API não sobe (o segredo fixo do código deixava forjar token)', () => {
    expect(() => segredoDoJwt(config(undefined))).toThrow(/JWT_SECRET/);
    expect(() => segredoDoJwt(config(''))).toThrow(/JWT_SECRET/);
    expect(segredoDoJwt(config('abc'))).toBe('abc');
  });
});

describe('JwtStrategy.validate', () => {
  const usuarios = { findOne: jest.fn() };
  const estrategia = new JwtStrategy(config('segredo-de-teste'), usuarios as unknown as UsuariosService);
  const token = { sub: 'u1', email: 'a@b.c', nome: 'A', role: 'admin', permissions: ['usuarios.manage'] };

  it('vale o papel e as permissões de agora, não os do token (quem perde acesso perde na hora)', async () => {
    usuarios.findOne.mockResolvedValue({
      status: 'Ativo',
      roles: [{ name: 'operador' }],
      all_permissions: [{ name: 'execucao_os.view' }, { name: 'execucao_os.executar' }, { name: 'execucao_os.view' }],
    });

    await expect(estrategia.validate(token)).resolves.toEqual({
      id: 'u1',
      email: 'a@b.c',
      nome: 'A',
      role: 'operador',
      permissions: ['execucao_os.view', 'execucao_os.executar'],
      deve_trocar_senha: false,
    });
  });

  it('usuário inativo ou apagado não entra', async () => {
    usuarios.findOne.mockResolvedValue({ status: 'Inativo', roles: [], all_permissions: [] });
    await expect(estrategia.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);

    usuarios.findOne.mockRejectedValue(new Error('não existe'));
    await expect(estrategia.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // Mesma assinatura e 7 dias de validade: aceito como acesso, abria qualquer rota (revisão do SN-50)
  it('token de renovação não dá acesso, nem de usuário ativo', async () => {
    usuarios.findOne.mockReset().mockResolvedValue({ status: 'Ativo', roles: [{ name: 'admin' }], all_permissions: [] });

    await expect(estrategia.validate({ sub: 'u1', type: 'refresh' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usuarios.findOne).not.toHaveBeenCalled();
  });
});

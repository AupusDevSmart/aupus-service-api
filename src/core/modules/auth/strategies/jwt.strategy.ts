import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { segredoDoJwt } from '../segredo-do-jwt';

/**
 * Estratégia JWT para autenticação via Passport
 * Valida tokens JWT e injeta dados do usuário no request
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usuariosService: UsuariosService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: segredoDoJwt(configService),
    });
  }

  /**
   * Valida o payload do JWT e retorna dados do usuário
   * Este método é chamado automaticamente pelo Passport após validar o token
   */
  async validate(payload: any) {
    // Buscar usuário no banco para garantir que ainda existe e está ativo
    const usuario = await this.usuariosService
      .findOne(payload.sub)
      .catch(() => null);

    if (!usuario || usuario.status !== 'Ativo') {
      throw new UnauthorizedException('Usuário inválido ou inativo');
    }

    // Papel e permissões de AGORA, lidos do banco nesta mesma consulta: os do
    // token valiam até ele vencer (1 h), e quem perdia um papel continuava com ele.
    return {
      id: payload.sub,
      email: payload.email,
      nome: payload.nome,
      role: usuario.roles?.[0]?.name ?? null,
      permissions: [...new Set((usuario.all_permissions ?? []).map((p) => p.name))],
      // Primeiro acesso: o TrocaDeSenhaGuard só deixa trocar a senha
      deve_trocar_senha: !!usuario.deve_trocar_senha,
    };
  }
}

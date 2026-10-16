import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { segredoDoJwt } from '../segredo-do-jwt';
import type { UserRoleResponse } from '../../usuarios/dto/usuario-response.dto';

/** O que o login assina no access token (ver `AuthService.login`). */
export interface PayloadDoJwt {
  sub: string;
  email: string;
  nome: string;
  role?: string | null;
  permissions?: string[];
  /** 'refresh' no token de renovação (7 dias), que só serve para /auth/refresh. */
  type?: string;
}

/** O usuário do request (`req.user` / `@CurrentUser()`), como o `validate` o entrega. */
export interface UsuarioAutenticado {
  id: string;
  email: string;
  nome: string;
  role: string | null;
  permissions: string[];
  deve_trocar_senha: boolean;
}

/**
 * Estratégia JWT para autenticação via Passport
 * Valida tokens JWT e injeta dados do usuário no request
 */
/** O papel chega como objeto no detalhe do usuário e como nome na lista: lê os dois. */
function nomeDoPapel(papel: UserRoleResponse | string | undefined): string | null {
  if (!papel) return null;
  return typeof papel === 'string' ? papel : papel.name ?? null;
}

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
  async validate(payload: PayloadDoJwt): Promise<UsuarioAutenticado> {
    // O token de renovação tem a mesma assinatura e vale 7 dias: aceito aqui, ele
    // abria qualquer rota e o prazo de 1 h do token de acesso não servia para
    // nada (achado na revisão do SN-50). O /auth/refresh o lê pelo corpo.
    if (payload.type === 'refresh') throw new UnauthorizedException('Token de renovação não dá acesso');

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
      role: nomeDoPapel(usuario.roles?.[0]),
      permissions: [...new Set<string>((usuario.all_permissions ?? []).map((p) => p.name))],
      // Primeiro acesso: o TrocaDeSenhaGuard só deixa trocar a senha
      deve_trocar_senha: !!usuario.deve_trocar_senha,
    };
  }
}

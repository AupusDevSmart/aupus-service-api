import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from '../../usuarios/usuarios.service';

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
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'your-secret-key-change-in-production',
    });
  }

  /**
   * Valida o payload do JWT e retorna dados do usuário
   * Este método é chamado automaticamente pelo Passport após validar o token
   */
  async validate(payload: any) {
    console.log(`🔍 [JWT STRATEGY] Validando payload para usuário: ${payload.sub}`);

    // Buscar usuário no banco para garantir que ainda existe e está ativo
    const usuario = await this.usuariosService
      .findOne(payload.sub)
      .catch(() => null);

    if (!usuario || usuario.status !== 'Ativo') {
      console.log(`❌ [JWT STRATEGY] Usuário inválido ou inativo: ${payload.sub}`);
      throw new UnauthorizedException('Usuário inválido ou inativo');
    }

    console.log(`✅ [JWT STRATEGY] Usuário validado: ${payload.sub}`);

    // Retornar dados que serão injetados em req.user
    const userData = {
      id: payload.sub,
      email: payload.email,
      nome: payload.nome,
      role: payload.role,
      permissions: payload.permissions || [],
    };

    console.log(`📝 [JWT STRATEGY] Dados do usuário para req.user:`, userData);

    return userData;
  }
}

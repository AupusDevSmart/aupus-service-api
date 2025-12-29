import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard JWT para proteger rotas
 * Valida se o request possui um token JWT válido
 *
 * Rotas marcadas com @Public() são ignoradas por este guard
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar se a rota é pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const hasAuthHeader = !!request.headers.authorization;
    const authHeaderValue = request.headers.authorization;

    console.log('🔐 [JWT GUARD] Verificando rota:', {
      url: request.url,
      method: request.method,
      isPublic,
      hasAuthHeader,
      authHeaderPreview: authHeaderValue ? `${authHeaderValue.substring(0, 20)}...` : 'null'
    });

    if (isPublic) {
      console.log('✅ [JWT GUARD] Rota pública, permitindo acesso sem autenticação');
      return true;
    }

    if (!hasAuthHeader) {
      console.warn('⚠️ [JWT GUARD] Nenhum header Authorization encontrado');
    }

    // Se não é pública, validar JWT
    try {
      const result = await super.canActivate(context);
      console.log('✅ [JWT GUARD] Token validado com sucesso, resultado:', result);
      return result as boolean;
    } catch (error) {
      console.error('❌ [JWT GUARD] Erro ao validar token:', error.message);
      throw error;
    }
  }
}

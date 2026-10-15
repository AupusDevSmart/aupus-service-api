import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Sentry } from '../../config/sentry.config';
import type { UsuarioAutenticado } from '@/core/modules/auth/strategies/jwt.strategy';

@Injectable()
export class SentryMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Adicionar contexto do usuário se disponível (após autenticação)
    if (req.user) {
      // O usuário do JwtStrategy não tem `username`: o nome dele é `nome`
      const usuario = req.user as UsuarioAutenticado;
      Sentry.setUser({
        id: usuario.id,
        username: usuario.nome,
        email: usuario.email,
      });
    }

    // Adicionar tags úteis
    Sentry.setTags({
      method: req.method,
      path: req.path,
    });

    // Adicionar contexto da requisição
    Sentry.setContext('request', {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
    });

    next();
  }
}

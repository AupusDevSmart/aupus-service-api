import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const LIBERADO_SEM_TROCAR_SENHA = 'liberadoSemTrocarSenha';

/** A rota que quem ainda precisa trocar a senha pode usar (ver o próprio usuário, trocar a senha, sair). */
export const LiberadoSemTrocarSenha = () => SetMetadata(LIBERADO_SEM_TROCAR_SENHA, true);

/**
 * Primeiro acesso ou senha redefinida por outra pessoa (SN-34): até trocar a
 * senha, a pessoa só usa as rotas marcadas com @LiberadoSemTrocarSenha. Roda
 * depois do JwtAuthGuard (o `user` vem do JwtStrategy, lido do banco). A tela
 * reconhece o código `TROCAR_SENHA` e leva para a troca.
 */
@Injectable()
export class TrocaDeSenhaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user?.deve_trocar_senha) return true;

    const liberada = this.reflector.getAllAndOverride<boolean>(LIBERADO_SEM_TROCAR_SENHA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (liberada) return true;

    throw new ForbiddenException({ code: 'TROCAR_SENHA', message: 'Troque a senha provisória antes de continuar.' });
  }
}

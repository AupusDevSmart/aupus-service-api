import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionScopeService } from '../permission-scope.service';
import {
  PLANTA_SCOPE_KEY,
  PlantaScopeMetadata,
  SO_SEM_ESCOPO_KEY,
} from '../decorators/planta-scope.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Aplica `assertEntityInScope` nos handlers marcados com `@UsePlantaScope(...)`.
 * Registrado como APP_GUARD depois do JwtAuthGuard (que poe o req.user) e do
 * PermissionsGuard (SN-75).
 *
 * - Rotas @Public() e sem @UsePlantaScope: passa.
 * - admin/gerente/analista/super_admin: passa (escopo null).
 * - operador/proprietario: 404 com a mesma mensagem do que nao existe, para o
 *   que nao existe e para o que esta fora das plantas dele (SN-57).
 *
 * Roda antes do ValidationPipe: o valor vem cru. Texto e conferido; lista,
 * cada item; outro tipo (numero, objeto) e "nao encontrado".
 */
@Injectable()
export class PlantaScopeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private scopeService: PermissionScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const metadados = this.reflector.getAllAndOverride<PlantaScopeMetadata[] | PlantaScopeMetadata>(PLANTA_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const soSemEscopo = this.reflector.getAllAndOverride<string>(SO_SEM_ESCOPO_KEY, [context.getHandler(), context.getClass()]);
    if (!metadados && !soSemEscopo) return true;

    const req = context.switchToHttp().getRequest();
    // Admin, gerente e analista não têm escopo: passam sem consulta por id
    if (!this.scopeService.isScoped(await this.scopeService.getScope(req.user))) return true;
    if (soSemEscopo) throw new ForbiddenException(soSemEscopo);
    if (!metadados) return true;

    for (const meta of Array.isArray(metadados) ? metadados : [metadados]) {
      const from = meta.from ?? 'param';
      const fonte = from === 'param' ? req.params : from === 'body' ? req.body : req.query;
      const valor: unknown = fonte?.[meta.name ?? 'id'];

      if (meta.opcional && (valor === undefined || valor === null || valor === '')) continue;
      const ids = Array.isArray(valor) ? valor : [valor];
      for (const id of ids) {
        // '' cai no "nao encontrado" do assertEntityInScope
        await this.scopeService.assertEntityInScope(meta.entity, typeof id === 'string' ? id : '', req.user, meta.naoEncontrado);
      }
    }
    return true;
  }
}

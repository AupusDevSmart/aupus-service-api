import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator que retorna o ID do proprietário para filtrar dados.
 *
 * Comportamento:
 * - Para admin/super_admin: retorna null (sem filtro, vê todos os dados)
 * - Para outros roles: retorna user.id (filtra apenas dados do usuário)
 *
 * Uso:
 * @Get()
 * findAll(@UserProprietarioId() proprietarioId: string | null) {
 *   // proprietarioId será null para admins ou user.id para outros usuários
 * }
 */
export const UserProprietarioId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    // Roles que podem ver todos os dados (sem filtro)
    const adminRoles = ['admin', 'super_admin'];

    const userRole = user.role || '';

    // Se for admin ou super_admin, retorna null (sem filtro)
    if (adminRoles.includes(userRole)) {
      return null;
    }

    // Para outros roles, retorna o ID do usuário (filtro ativo)
    return user.id || user.sub || null;
  },
);

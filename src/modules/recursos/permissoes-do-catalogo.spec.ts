import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '@/core/modules/auth/guards/permissions.guard';
import { MaquinariosController } from '@/modules/maquinarios/maquinarios.controller';
import { RecursosController } from './recursos.controller';

/**
 * Quem pode o quê no catálogo de recursos e de maquinários (SN-98). Quem edita
 * instrução (`manutencao.manage`) lê o catálogo e cadastra o que falta pelo "+"
 * do formulário; alterar e remover — o preço e a cobrança que valem para todas
 * as instruções — é só da tela (`recursos.manage`). Até o SN-98 a permissão da
 * classe deixava `manutencao.manage` mudar o preço pela API, e a planilha de
 * instruções passaria a fazer isso pela tela.
 */
describe('Catálogo de recursos e maquinários — permissões', () => {
  const guard = new PermissionsGuard(new Reflector());

  const contexto = (controller: object & { prototype: object }, handler: string, permissions: string[]) =>
    ({
      getHandler: () => (controller.prototype as Record<string, () => unknown>)[handler],
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', permissions } }) }),
    }) as unknown as ExecutionContext;

  const casos: Array<[string, object & { prototype: object }, string, boolean]> = [
    ['recursos: listar', RecursosController, 'listar', true],
    ['recursos: cadastrar', RecursosController, 'criar', true],
    ['recursos: alterar', RecursosController, 'atualizar', false],
    ['recursos: remover', RecursosController, 'remover', false],
    ['maquinários: listar', MaquinariosController, 'listar', true],
    ['maquinários: cadastrar', MaquinariosController, 'criar', true],
    ['maquinários: alterar', MaquinariosController, 'atualizar', false],
    ['maquinários: remover', MaquinariosController, 'remover', false],
  ];

  it.each(casos)('%s: com manutencao.manage %s; com recursos.manage, sempre', (_nome, controller, handler, comManutencao) => {
    expect(typeof (controller.prototype as Record<string, unknown>)[handler]).toBe('function');
    expect(guard.canActivate(contexto(controller, handler, ['manutencao.manage']))).toBe(comManutencao);
    expect(guard.canActivate(contexto(controller, handler, ['recursos.manage']))).toBe(true);
    expect(guard.canActivate(contexto(controller, handler, ['dashboard.view']))).toBe(false);
  });
});

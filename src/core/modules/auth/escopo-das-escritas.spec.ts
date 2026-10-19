import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { PermissionsGuard } from './guards/permissions.guard';
import { PlantaScopeGuard } from './guards/planta-scope.guard';
import { PERMISSIONS_KEY } from './decorators/permissions.decorator';
import { PLANTA_SCOPE_KEY } from './decorators/planta-scope.decorator';
import { EquipamentosController } from '../equipamentos/equipamentos.controller';
import { UnidadesController } from '../unidades/unidades.controller';
import { PlantasController } from '../plantas/plantas.controller';
import { AtivosFuncionaisController } from '../ativos-funcionais/ativos-funcionais.controller';

/**
 * Toda escrita dos cadastros por planta confere o escopo (SN-75). Até então as
 * leituras conferiam e as escritas não: o cliente ou o técnico com `.manage`
 * direto editava e apagava equipamento de outra planta.
 *
 * Rota nova de escrita entra com `@UsePlantaScope(...)`, ou na lista abaixo
 * com a razão — e com teste no `cadastro-por-escopo.spec.ts`.
 */
const CONFERIDAS_NO_HANDLER: Record<string, string> = {
  // O id é do anexo: o handler busca o anexo e confere o equipamento/unidade dele
  'EquipamentosController.removerAnexo': 'pelo equipamento do anexo',
  'UnidadesController.removerAnexo': 'pela unidade do anexo',
  // Planta nova não tem planta para conferir: a regra é a do dono (dono-da-planta.ts)
  'PlantasController.create': 'só em nome próprio',
};

const CONTROLLERS = [EquipamentosController, UnidadesController, PlantasController, AtivosFuncionaisController];

function escritas() {
  return CONTROLLERS.flatMap((controller) =>
    Object.getOwnPropertyNames(controller.prototype)
      .filter((nome) => nome !== 'constructor')
      .map((nome) => {
        const handler = (controller.prototype as unknown as Record<string, () => unknown>)[nome];
        return {
          rota: `${controller.name}.${nome}`,
          metodo: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined,
          caminho: Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
          permissoes: (Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined) ?? [],
          escopo: Reflect.getMetadata(PLANTA_SCOPE_KEY, handler) as unknown[] | undefined,
        };
      })
      .filter((r) => r.metodo !== undefined && r.metodo !== RequestMethod.GET),
  );
}

describe('escopo das escritas dos cadastros (SN-75)', () => {
  it('a varredura acha as escritas (a lista não pode vir vazia por engano)', () => {
    expect(escritas().length).toBeGreaterThan(20);
  });

  it.each(escritas().map((r) => [r.rota, r]))('%s confere o escopo', (_rota, r) => {
    const conferida = (r.escopo?.length ?? 0) > 0 || r.rota in CONFERIDAS_NO_HANDLER;
    expect({ rota: r.rota, caminho: r.caminho, conferida }).toEqual({ rota: r.rota, caminho: r.caminho, conferida: true });
  });

  // Até o SN-75 o guard não estava na cadeia, e o decorator não fazia nada
  it('o guard do escopo está na cadeia global, depois do de permissões', () => {
    const guardas = ((Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as Array<{ provide?: unknown; useClass?: unknown }>) ?? [])
      .filter((p) => p.provide === APP_GUARD)
      .map((p) => p.useClass);
    expect(guardas).toContain(PlantaScopeGuard);
    expect(guardas.indexOf(PlantaScopeGuard)).toBeGreaterThan(guardas.indexOf(PermissionsGuard));
  });

  it('a lista de exceções só tem rota que existe', () => {
    const rotas = new Set(escritas().map((r) => r.rota));
    for (const rota of Object.keys(CONFERIDAS_NO_HANDLER)) expect(rotas.has(rota)).toBe(true);
  });
});

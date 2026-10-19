import { Global, Module } from '@nestjs/common';
import { PermissionScopeService } from './permission-scope.service';
import { PlantaScopeGuard } from './guards/planta-scope.guard';

/**
 * Exporta `PermissionScopeService` e `PlantaScopeGuard` globalmente para qualquer
 * modulo injetar sem precisar importar AuthModule (evita dependencia circular).
 *
 * O guard e registrado como APP_GUARD no AuthModule, depois do PermissionsGuard
 * (SN-75): aqui nao, para a ordem da cadeia ficar num lugar so.
 */
@Global()
@Module({
  providers: [PermissionScopeService, PlantaScopeGuard],
  exports: [PermissionScopeService, PlantaScopeGuard],
})
export class PermissionScopeModule {}

import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { SincronizacaoModule } from '@/core';

/**
 * O SincronizacaoModule saiu do AppModule do NexON por engano (b42774d,
 * 16/09/2026) e ninguem viu por 7 semanas: build, tela e health seguiam verdes.
 * O mesmo teste existe la; este guarda o lado do Service.
 */
describe('AppModule', () => {
  it('carrega a sincronizacao de cadastro com o AupusNexOn', () => {
    const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];
    expect(imports).toContain(SincronizacaoModule);
  });
});

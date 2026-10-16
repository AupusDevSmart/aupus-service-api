import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';

/**
 * Teto dos campos de texto de um upload (SN-50). O multer roda no
 * interceptor, depois do teto do corpo JSON, e monta objeto a partir de
 * `a[k1]`, `a[0][b]` sem limite de quantidade: 200 mil campos num upload
 * custavam ~36 s de event loop parado na validação. Nossos uploads mandam um
 * arquivo e poucos campos (tipo, descrição). O arquivo fica na memória até o
 * service conferir o tamanho: sem `fileSize`, um de 100 MB (o teto do nginx)
 * ocupava a memória inteira antes de ser recusado. 20 MB é o maior limite dos
 * services hoje.
 *
 * Interceptor com `limits` próprio substitui este objeto inteiro (o Nest
 * mescla raso): espalhar LIMITES_DO_MULTIPART junto.
 */
export const LIMITES_DO_MULTIPART = { fields: 50, parts: 60, fieldNameSize: 100, fieldSize: 1024 * 1024, fileSize: 20 * 1024 * 1024 };

/** Global: o FileInterceptor de qualquer módulo recebe estes limites. */
@Global()
@Module({
  imports: [MulterModule.register({ limits: LIMITES_DO_MULTIPART })],
  exports: [MulterModule],
})
export class LimitesDoUploadModule {}

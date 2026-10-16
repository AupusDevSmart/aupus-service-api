import { Module } from '@nestjs/common';
import { ComentariosDaOSController, ComentariosDaSolicitacaoController } from './comentarios.controller';
import { ComentariosService } from './comentarios.service';

/** Comentários da OS e da solicitação (SN-48). */
@Module({
  controllers: [ComentariosDaOSController, ComentariosDaSolicitacaoController],
  providers: [ComentariosService],
})
export class ComentariosModule {}

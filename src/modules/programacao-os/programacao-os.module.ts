import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ProgramacaoOSController } from './programacao-os.controller';
import { ProgramacaoOSService } from './programacao-os.service';
import { AnomaliasService } from '../anomalias/anomalias.service';
import { SolicitacoesServicoModule } from '../solicitacoes-servico/solicitacoes-servico.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SolicitacoesServicoModule), // Para evitar dependência circular
  ],
  controllers: [ProgramacaoOSController],
  providers: [ProgramacaoOSService, AnomaliasService],
  exports: [ProgramacaoOSService],
})
export class ProgramacaoOSModule {}
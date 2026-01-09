import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ProgramacaoOSController } from './programacao-os.controller';
import { ProgramacaoOSService } from './programacao-os.service';
import { AnomaliasService } from '../anomalias/anomalias.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProgramacaoOSController],
  providers: [ProgramacaoOSService, AnomaliasService],
  exports: [ProgramacaoOSService],
})
export class ProgramacaoOSModule {}
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ExecucaoOSController } from './execucao-os.controller';
import { ExecucaoOSService } from './execucao-os.service';
import { AnexosOSService } from './anexos-os.service';
import { AnomaliasService } from '../anomalias/anomalias.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExecucaoOSController],
  providers: [ExecucaoOSService, AnexosOSService, AnomaliasService],
  exports: [ExecucaoOSService, AnexosOSService],
})
export class ExecucaoOSModule {}
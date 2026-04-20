// src/anomalias/anomalias.module.ts
import { Module } from '@nestjs/common';
import { AnomaliasService } from './anomalias.service';
import { AnexosAnomaliasService } from './anexos-anomalias.service';
import { AnomaliasController } from './anomalias.controller';
import { PrismaModule } from '@aupus/api-shared';

@Module({
  imports: [PrismaModule],
  controllers: [AnomaliasController],
  providers: [AnomaliasService, AnexosAnomaliasService],
  exports: [AnomaliasService, AnexosAnomaliasService]
})
export class AnomaliasModule {}
// src/modules/instrucoes/instrucoes.module.ts
import { Module } from '@nestjs/common';
import { InstrucoesController } from './instrucoes.controller';
import { InstrucoesService } from './instrucoes.service';
import { AnexosInstrucoesService } from './anexos-instrucoes.service';
import { PrismaModule } from '@aupus/api-shared';

@Module({
  imports: [PrismaModule],
  controllers: [InstrucoesController],
  providers: [InstrucoesService, AnexosInstrucoesService],
  exports: [InstrucoesService],
})
export class InstrucoesModule {}

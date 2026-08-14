// src/modules/recursos/recursos.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '@aupus/api-shared';
import { RecursosController } from './recursos.controller';
import { RecursosService } from './recursos.service';

@Module({
  imports: [PrismaModule],
  controllers: [RecursosController],
  providers: [RecursosService],
  exports: [RecursosService],
})
export class RecursosModule {}

// src/modules/maquinarios/maquinarios.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core';
import { MaquinariosController } from './maquinarios.controller';
import { MaquinariosService } from './maquinarios.service';

@Module({
  imports: [PrismaModule],
  controllers: [MaquinariosController],
  providers: [MaquinariosService],
  exports: [MaquinariosService],
})
export class MaquinariosModule {}

// src/modules/plantas/plantas.module.ts
import { Module } from '@nestjs/common';
import { PlantasController } from './plantas.controller';
import { PlantasService } from './plantas.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlantasController],
  providers: [PlantasService],
  exports: [PlantasService], // Exportar caso outros módulos precisem usar
})
export class PlantasModule {}
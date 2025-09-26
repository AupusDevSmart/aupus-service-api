// src/modules/tarefas/tarefas.module.ts
import { Module } from '@nestjs/common';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';
import { AnexosTarefasService } from './anexos-tarefas.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TarefasController],
  providers: [TarefasService, AnexosTarefasService],
  exports: [TarefasService],
})
export class TarefasModule {}
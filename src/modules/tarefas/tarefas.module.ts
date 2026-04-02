// src/modules/tarefas/tarefas.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';
import { TarefasSchedulerService } from './tarefas-scheduler.service';
import { AnexosTarefasService } from './anexos-tarefas.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ProgramacaoOSModule } from '../programacao-os/programacao-os.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ProgramacaoOSModule),
  ],
  controllers: [TarefasController],
  providers: [TarefasService, TarefasSchedulerService, AnexosTarefasService],
  exports: [TarefasService],
})
export class TarefasModule {}
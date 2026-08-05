// src/modules/tarefas/tarefas.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';
import { TarefasSchedulerService } from './tarefas-scheduler.service';
import { PrismaModule } from '@aupus/api-shared';
import { ProgramacaoOSModule } from '../programacao-os/programacao-os.module';
import { PlanosManutencaoModule } from '../planos-manutencao/planos-manutencao.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ProgramacaoOSModule),
    // Mexer numa tarefa de template precisa propagar para as copias
    forwardRef(() => PlanosManutencaoModule),
  ],
  controllers: [TarefasController],
  providers: [TarefasService, TarefasSchedulerService],
  exports: [TarefasService],
})
export class TarefasModule {}
// src/modules/tarefas/dto/update-status-tarefa.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusTarefa } from '@aupus/api-shared';

export class UpdateStatusTarefaDto {
  @IsEnum(StatusTarefa)
  status: StatusTarefa;

  @IsString()
  @IsOptional()
  atualizado_por?: string;
}
// src/modules/tarefas/dto/reordenar-tarefa.dto.ts
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReordenarTarefaDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  nova_ordem: number;
}
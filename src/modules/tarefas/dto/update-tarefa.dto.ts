// src/modules/tarefas/dto/update-tarefa.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateTarefaDto } from './create-tarefa.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdateTarefaDto extends PartialType(CreateTarefaDto) {
  @IsString()
  @IsOptional()
  atualizado_por?: string;
}
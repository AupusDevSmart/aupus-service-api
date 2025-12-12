// src/modules/tarefas/dto/create-sub-tarefa.dto.ts
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubTarefaDto {
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsBoolean()
  @IsOptional()
  obrigatoria?: boolean = false;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  tempo_estimado?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  ordem?: number;
}
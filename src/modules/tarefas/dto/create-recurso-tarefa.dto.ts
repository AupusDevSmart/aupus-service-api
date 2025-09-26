// src/modules/tarefas/dto/create-recurso-tarefa.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean, IsDecimal } from 'class-validator';
import { TipoRecurso } from '@prisma/client';
import { Type, Transform } from 'class-transformer';

export class CreateRecursoTarefaDto {
  @IsEnum(TipoRecurso)
  tipo: TipoRecurso;

  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsOptional()
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  quantidade?: number;

  @IsString()
  @IsOptional()
  unidade?: string;

  @IsBoolean()
  @IsOptional()
  obrigatorio?: boolean = false;
}
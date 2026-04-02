// src/modules/instrucoes/dto/create-recurso-instrucao.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { TipoRecurso } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateRecursoInstrucaoDto {
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

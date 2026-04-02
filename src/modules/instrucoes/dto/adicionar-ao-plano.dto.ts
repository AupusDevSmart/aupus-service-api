// src/modules/instrucoes/dto/adicionar-ao-plano.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FrequenciaTarefa } from '@prisma/client';

export class AdicionarAoPlanoDto {
  @IsString()
  @IsNotEmpty()
  plano_manutencao_id: string;

  @IsEnum(FrequenciaTarefa)
  frequencia: FrequenciaTarefa;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  frequencia_personalizada?: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  ordem: number;

  @IsString()
  @IsOptional()
  criado_por?: string;
}

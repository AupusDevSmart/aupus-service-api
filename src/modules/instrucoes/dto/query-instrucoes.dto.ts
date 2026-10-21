// src/modules/instrucoes/dto/query-instrucoes.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { StatusTarefa } from '@/core';
import { BooleanoDoTexto } from '@/common/decorators/booleano';

export class QueryInstrucoesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(StatusTarefa)
  status?: StatusTarefa;

  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  ativo?: boolean;

  /** SN-85: a frente de trabalho, exata */
  @IsOptional()
  @IsString()
  frente?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sort_by?: string = 'created_at';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sort_order?: 'asc' | 'desc' = 'desc';
}

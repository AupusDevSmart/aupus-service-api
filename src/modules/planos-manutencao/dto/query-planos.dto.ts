// src/modules/planos-manutencao/dto/query-planos.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { StatusPlano } from '@prisma/client';

export class QueryPlanosDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  equipamento_id?: string;

  @IsOptional()
  @IsString()
  planta_id?: string;

  @IsOptional()
  @IsEnum(StatusPlano)
  status?: StatusPlano;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  ativo?: boolean;

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
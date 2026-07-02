// src/modules/planos-manutencao/dto/query-planos.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryPlanosDto {
  @ApiPropertyOptional({ description: 'Busca em nome, descrição ou equipamento' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'ID do equipamento' })
  @IsOptional()
  @IsString()
  equipamento_id?: string;

  @ApiPropertyOptional({ description: 'ID da planta para filtrar planos' })
  @IsOptional()
  @IsString()
  planta_id?: string;

  @ApiPropertyOptional({ description: 'ID da unidade para filtrar planos' })
  @IsOptional()
  @IsString()
  unidade_id?: string;

  @ApiPropertyOptional({ description: 'Número da página', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items por página', default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Campo para ordenação', default: 'created_at' })
  @IsOptional()
  @IsString()
  sort_by?: string = 'created_at';

  @ApiPropertyOptional({ description: 'Direção da ordenação', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sort_order?: 'asc' | 'desc' = 'desc';
}
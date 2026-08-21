// src/modules/planos-manutencao/dto/query-planos.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryPlanosDto {
  @ApiPropertyOptional({ description: 'Busca em nome, descrição ou equipamento' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Inverte o recorte da lista: em vez dos templates, os planos JA VINCULADOS a
   * um equipamento.
   *
   * Quem programa uma OS precisa destes: a OS e para um ativo, e o template nao
   * tem equipamento. Sem o parametro a lista segue como estava, so com
   * templates, que e o que a tela de planos usa.
   */
  @ApiPropertyOptional({
    description: 'Lista os planos vinculados a equipamento, em vez dos templates',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  vinculados?: boolean;

  @ApiPropertyOptional({ description: 'ID da categoria de equipamento (filtra templates)' })
  @IsOptional()
  @IsString()
  categoria_id?: string;

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
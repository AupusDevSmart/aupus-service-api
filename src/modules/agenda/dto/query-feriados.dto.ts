import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsEnum, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoFeriado } from './create-feriado.dto';

export class QueryFeriadosDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Página atual' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100, description: 'Itens por página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'natal', description: 'Buscar por nome ou descrição' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: TipoFeriado.NACIONAL,
    enum: TipoFeriado,
    description: 'Filtrar por tipo de feriado'
  })
  @IsOptional()
  @IsEnum(TipoFeriado)
  tipo?: TipoFeriado;

  @ApiPropertyOptional({
    example: 'plt_01234567890123456789012345',
    description: 'Filtrar feriados de uma planta específica'
  })
  @IsOptional()
  @IsString()
  plantaId?: string;

  @ApiPropertyOptional({ example: 2024, description: 'Filtrar por ano' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  ano?: number;

  @ApiPropertyOptional({ example: 12, description: 'Filtrar por mês (1-12)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar apenas feriados gerais (true) ou específicos (false)'
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  geral?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar apenas feriados recorrentes'
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  recorrente?: boolean;

  @ApiPropertyOptional({
    example: 'nome',
    enum: ['nome', 'data', 'tipo', 'created_at'],
    description: 'Campo para ordenação'
  })
  @IsOptional()
  @IsString()
  @IsIn(['nome', 'data', 'tipo', 'created_at'])
  orderBy?: string = 'data';

  @ApiPropertyOptional({ example: 'asc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  orderDirection?: 'asc' | 'desc' = 'asc';
}
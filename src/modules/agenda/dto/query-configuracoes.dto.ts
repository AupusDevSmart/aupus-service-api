import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryConfiguracoesDto {
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

  @ApiPropertyOptional({ example: 'comercial', description: 'Buscar por nome ou descrição' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'plt_01234567890123456789012345',
    description: 'Filtrar configurações de uma planta específica'
  })
  @IsOptional()
  @IsString()
  plantaId?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar apenas configurações gerais (true) ou específicas (false)'
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
    description: 'Filtrar configurações que incluem sábado como dia útil'
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  sabado?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Filtrar configurações que incluem domingo como dia útil'
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  domingo?: boolean;

  @ApiPropertyOptional({
    example: 'nome',
    enum: ['nome', 'created_at', 'total_dias_uteis'],
    description: 'Campo para ordenação'
  })
  @IsOptional()
  @IsString()
  @IsIn(['nome', 'created_at', 'total_dias_uteis'])
  orderBy?: string = 'nome';

  @ApiPropertyOptional({ example: 'asc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  orderDirection?: 'asc' | 'desc' = 'asc';
}
import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BooleanoDoTexto } from '@/common/decorators/booleano';

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
  @BooleanoDoTexto()
  @IsBoolean()
  geral?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar configurações que incluem sábado como dia útil'
  })
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  sabado?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Filtrar configurações que incluem domingo como dia útil'
  })
  @IsOptional()
  @BooleanoDoTexto()
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
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EquipamentoQueryDto {
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

  @ApiPropertyOptional({ example: 'motor', description: 'Buscar por nome, fabricante, modelo, etc.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'plt_01234567890123456789012345' })
  @IsOptional()
  @IsString()
  planta_id?: string;

  @ApiPropertyOptional({ example: 'usr_01234567890123456789012345' })
  @IsOptional()
  @IsString()
  proprietario_id?: string;

  @ApiPropertyOptional({ example: 'UC', enum: ['UC', 'UAR'] })
  @IsOptional()
  @IsString()
  @IsIn(['UC', 'UAR'])
  classificacao?: string;

  @ApiPropertyOptional({ example: '5', enum: ['1', '2', '3', '4', '5'] })
  @IsOptional()
  @IsString()
  @IsIn(['1', '2', '3', '4', '5'])
  criticidade?: string;

  @ApiPropertyOptional({ example: 'eqp_01234567890123456789012345', description: 'Filtrar componentes por equipamento pai' })
  @IsOptional()
  @IsString()
  equipamento_pai_id?: string;

  @ApiPropertyOptional({ 
    example: 'nome', 
    enum: ['nome', 'criticidade', 'created_at', 'fabricante', 'valor_contabil'],
    description: 'Campo para ordenação' 
  })
  @IsOptional()
  @IsString()
  @IsIn(['nome', 'criticidade', 'created_at', 'fabricante', 'valor_contabil'])
  orderBy?: string = 'created_at';

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  orderDirection?: 'asc' | 'desc' = 'desc';
}
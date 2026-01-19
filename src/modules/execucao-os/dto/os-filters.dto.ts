import { IsOptional, IsEnum, IsUUID, IsDateString, IsString, IsNumber, IsBoolean, Min, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusOS, TipoOS, PrioridadeOS } from '@prisma/client';

export class OSFiltersDto {
  @ApiPropertyOptional({ description: 'Página', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items por página', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Busca em descrição, local, ativo, número da OS' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: StatusOS, description: 'Status da OS' })
  @IsOptional()
  @IsEnum({ ...StatusOS, all: 'all' })
  status?: StatusOS | 'all';

  @ApiPropertyOptional({ enum: TipoOS, description: 'Tipo da OS' })
  @IsOptional()
  @IsEnum({ ...TipoOS, all: 'all' })
  tipo?: TipoOS | 'all';

  @ApiPropertyOptional({ enum: PrioridadeOS, description: 'Prioridade' })
  @IsOptional()
  @IsEnum({ ...PrioridadeOS, all: 'all' })
  prioridade?: PrioridadeOS | 'all';

  @ApiPropertyOptional({ description: 'Responsável pela execução' })
  @IsOptional()
  @IsString()
  responsavel?: string;

  @ApiPropertyOptional({ description: 'ID da planta' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  planta_id?: string;

  @ApiPropertyOptional({ description: 'Data de início do filtro', example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  data_inicio?: string;

  @ApiPropertyOptional({ description: 'Data de fim do filtro', example: '2025-12-31' })
  @IsOptional()
  @IsDateString()
  data_fim?: string;

  @ApiPropertyOptional({ description: 'Filtrar apenas OS atrasadas' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  atrasadas?: boolean;

  @ApiPropertyOptional({ description: 'Campo para ordenação', example: 'criado_em' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Direção da ordenação', enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
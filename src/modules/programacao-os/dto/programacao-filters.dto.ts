import { IsOptional, IsEnum, IsDateString, IsString, IsNumber, Min, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusProgramacaoOS, TipoOS, PrioridadeOS, OrigemOS } from '@prisma/client';

export class ProgramacaoFiltersDto {
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

  @ApiPropertyOptional({ description: 'Busca em descrição, local, ativo' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: StatusProgramacaoOS, description: 'Status da programação' })
  @IsOptional()
  @IsEnum({ ...StatusProgramacaoOS, all: 'all' })
  status?: StatusProgramacaoOS | 'all';

  @ApiPropertyOptional({ enum: TipoOS, description: 'Tipo da OS' })
  @IsOptional()
  @IsEnum({ ...TipoOS, all: 'all' })
  tipo?: TipoOS | 'all';

  @ApiPropertyOptional({ enum: PrioridadeOS, description: 'Prioridade' })
  @IsOptional()
  @IsEnum({ ...PrioridadeOS, all: 'all' })
  prioridade?: PrioridadeOS | 'all';

  @ApiPropertyOptional({ enum: OrigemOS, description: 'Origem' })
  @IsOptional()
  @IsEnum({ ...OrigemOS, all: 'all' })
  origem?: OrigemOS | 'all';

  @ApiPropertyOptional({ description: 'ID da planta' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  planta_id?: string;

  @ApiPropertyOptional({ description: 'ID da unidade' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  unidade_id?: string;

  @ApiPropertyOptional({ description: 'Data de início do filtro', example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  data_inicio?: string;

  @ApiPropertyOptional({ description: 'Data de fim do filtro', example: '2025-12-31' })
  @IsOptional()
  @IsDateString()
  data_fim?: string;

  @ApiPropertyOptional({ description: 'ID do criador' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  criado_por_id?: string;
}
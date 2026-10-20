// ===== src/modules/anomalias/dto/anomalia-filters.dto.ts =====
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrioridadeAnomalia, OrigemAnomalia } from './create-anomalia.dto';
import { StatusAnomalia } from '@/core';

export class AnomaliaFiltersDto {
  @ApiProperty({ required: false, description: 'Busca por texto livre' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Período (formato: "Janeiro de 2025")' })
  @IsOptional()
  @IsString()
  periodo?: string;

  @ApiProperty({ required: false, enum: StatusAnomalia })
  @IsOptional()
  @IsEnum(StatusAnomalia)
  status?: StatusAnomalia;

  @ApiProperty({ required: false, enum: PrioridadeAnomalia })
  @IsOptional()
  @IsEnum(PrioridadeAnomalia)
  prioridade?: PrioridadeAnomalia;

  @ApiProperty({ required: false, enum: OrigemAnomalia })
  @IsOptional()
  @IsEnum(OrigemAnomalia)
  origem?: OrigemAnomalia;

  @ApiProperty({ required: false, description: 'ID da planta' })
  @IsOptional()
  @IsString()
  planta?: string;

  @ApiProperty({ required: false, description: 'ID da unidade' })
  @IsOptional()
  @IsString()
  unidade?: string;

  // Inteiros com teto (revisão do SN-77): só com o parseInt, "abc" virava NaN
  // (500), -1 lia do fim da tabela e ?limit=100000 trazia todas com os includes
  @ApiProperty({ required: false, description: 'Número da página', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Itens por página', default: 10, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
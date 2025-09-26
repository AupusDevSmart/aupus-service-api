// ===============================
// src/modules/ferramentas/dto/query-ferramentas.dto.ts
// ===============================
import { IsOptional, IsString, IsEnum, IsBoolean, IsNumberString, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusFerramenta } from './create-ferramenta.dto';

export class QueryFerramentasDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'multímetro' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Fluke' })
  @IsOptional()
  @IsString()
  fabricante?: string;

  @ApiPropertyOptional({ enum: StatusFerramenta })
  @IsOptional()
  @IsEnum(StatusFerramenta)
  status?: StatusFerramenta;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  necessita_calibracao?: boolean;

  @ApiPropertyOptional({ example: 'cm123user456def789' })
  @IsOptional()
  @IsString()
  responsavel_id?: string;

  @ApiPropertyOptional({ example: 'Empresa XYZ Ltda' })
  @IsOptional()
  @IsString()
  organizacao_nome?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  calibracao_vencida?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  calibracao_vencendo?: number;
}
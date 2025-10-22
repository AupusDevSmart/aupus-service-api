// ===== src/modules/anomalias/dto/anomalia-filters.dto.ts =====
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { StatusAnomalia, PrioridadeAnomalia, OrigemAnomalia } from './create-anomalia.dto';

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

  @ApiProperty({ required: false, description: 'Número da página', default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Itens por página', default: 10 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 10;
}
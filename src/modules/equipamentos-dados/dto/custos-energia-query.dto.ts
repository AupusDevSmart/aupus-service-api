import { IsEnum, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum PeriodoTipo {
  DIA = 'dia',
  MES = 'mes',
}

export class CustosEnergiaQueryDto {
  @ApiProperty({
    description: 'Tipo de período',
    enum: PeriodoTipo,
    example: 'mes',
  })
  @IsEnum(PeriodoTipo)
  periodo: PeriodoTipo;

  @ApiProperty({
    description: 'Data de referência (YYYY-MM-DD)',
    example: '2025-11-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  data?: string;
}

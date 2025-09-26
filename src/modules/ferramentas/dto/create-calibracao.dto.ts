// ===============================
// src/modules/ferramentas/dto/create-calibracao.dto.ts
// ===============================
import {
  IsDateString,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDecimal,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCalibracaoDto {
  @ApiProperty({ example: '2024-09-18' })
  @IsDateString()
  data_calibracao: string;

  @ApiProperty({ example: '2025-03-18' })
  @IsDateString()
  data_vencimento: string;

  @ApiProperty({ example: 'Laboratório TecCal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  responsavel: string;

  @ApiPropertyOptional({ example: 'CERT-2024-025' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificado_numero?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/certificados/cert-025.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  certificado_url?: string;

  @ApiPropertyOptional({ example: 'Calibração semestral realizada conforme procedimento' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ example: 150.00 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '2' })
  @Transform(({ value }) => value ? parseFloat(value) : null)
  custo?: number;
}
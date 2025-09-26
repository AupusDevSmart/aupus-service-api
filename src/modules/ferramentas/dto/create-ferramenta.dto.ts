// ===============================
// src/modules/ferramentas/dto/create-ferramenta.dto.ts
// ===============================
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsDecimal,
  IsEnum,
  IsUrl,
  ValidateIf,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StatusFerramenta {
  DISPONIVEL = 'disponivel',
  EM_USO = 'em_uso',
  MANUTENCAO = 'manutencao',
  INATIVO = 'inativo',
}

export class CreateFerramentaDto {
  @ApiProperty({ example: 'Empresa XYZ Ltda' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  organizacao_nome: string;

  @ApiProperty({ example: 'Multímetro Digital Fluke' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome: string;

  @ApiProperty({ example: 'FER-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @MinLength(3)
  codigo_patrimonial: string;

  @ApiProperty({ example: 'Fluke' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fabricante: string;

  @ApiProperty({ example: '87V' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  modelo: string;

  @ApiProperty({ example: 'FLK87V-12345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  numero_serie: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  necessita_calibracao: boolean;

  @ApiPropertyOptional({ example: '2024-12-15' })
  @ValidateIf((o) => o.necessita_calibracao === true)
  @IsNotEmpty()
  @IsDateString()
  proxima_data_calibracao?: string;

  @ApiProperty({ example: 'Planta Industrial São Paulo - Laboratório' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  localizacao_atual: string;

  @ApiProperty({ example: 'cm123user456def789' })
  @IsString()
  @IsNotEmpty()
  responsavel_id: string;

  @ApiPropertyOptional({ example: 'Planta Industrial São Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  planta_nome?: string;

  @ApiProperty({ example: '2023-06-10' })
  @IsDateString()
  data_aquisicao: string;

  @ApiPropertyOptional({ example: 1250.00 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '2' })
  @Transform(({ value }) => value ? parseFloat(value) : null)
  valor_aquisicao?: number;

  @ApiProperty({ enum: StatusFerramenta, example: StatusFerramenta.DISPONIVEL })
  @IsEnum(StatusFerramenta)
  status: StatusFerramenta;

  @ApiPropertyOptional({ example: 'Multímetro de alta precisão para medições elétricas' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/ferramentas/fer-001.jpg' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  foto_url?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/manuais/fluke-87v.pdf' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  manual_url?: string;
}
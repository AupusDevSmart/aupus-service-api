import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsNumber,
  IsPositive,
  Length,
  Matches,
} from 'class-validator';

export class TarifasA4VerdeDto {
  @ApiProperty({ description: 'TUSD Demanda', required: false, example: 0.123456 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tusd_d?: number;

  @ApiProperty({ description: 'TUSD Ponta', required: false, example: 0.654321 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tusd_p?: number;

  @ApiProperty({ description: 'TUSD Fora Ponta', required: false, example: 0.234567 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tusd_fp?: number;

  @ApiProperty({ description: 'TE Demanda', required: false, example: 0.345678 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  te_d?: number;

  @ApiProperty({ description: 'TE Ponta', required: false, example: 0.456789 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  te_p?: number;

  @ApiProperty({ description: 'TE Fora Ponta', required: false, example: 0.567890 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  te_fp?: number;
}

export class TarifasA3aVerdeDto {
  @ApiProperty({ description: 'TUSD Demanda', required: false, example: 0.123456 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tusd_d?: number;

  @ApiProperty({ description: 'TUSD Ponta', required: false, example: 0.654321 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tusd_p?: number;

  @ApiProperty({ description: 'TUSD Fora Ponta', required: false, example: 0.234567 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tusd_fp?: number;

  @ApiProperty({ description: 'TE Demanda', required: false, example: 0.345678 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  te_d?: number;

  @ApiProperty({ description: 'TE Ponta', required: false, example: 0.456789 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  te_p?: number;

  @ApiProperty({ description: 'TE Fora Ponta', required: false, example: 0.567890 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  te_fp?: number;
}

export class TarifasBDto {
  @ApiProperty({ description: 'TUSD Valor', required: false, example: 0.543210 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  tusd_valor?: number;

  @ApiProperty({ description: 'TE Valor', required: false, example: 0.432109 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  te_valor?: number;
}

export class CreateConcessionariaDto {
  @ApiProperty({
    description: 'Nome da concessionária',
    example: 'CPFL Paulista',
  })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty({
    description: 'Sigla do estado (2 caracteres)',
    example: 'SP',
    minLength: 2,
    maxLength: 2,
  })
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'Estado deve ser uma sigla válida de 2 letras maiúsculas' })
  estado: string;

  @ApiProperty({
    description: 'Data de início da vigência das tarifas',
    example: '2025-01-01',
  })
  @IsDateString()
  data_inicio: string;

  @ApiProperty({
    description: 'Data de validade das tarifas',
    example: '2025-12-31',
  })
  @IsDateString()
  data_validade: string;

  @ApiProperty({
    description: 'Tarifas para o subgrupo A4 Verde',
    type: TarifasA4VerdeDto,
    required: false,
  })
  @IsOptional()
  a4_verde?: TarifasA4VerdeDto;

  @ApiProperty({
    description: 'Tarifas para o subgrupo A3a Verde',
    type: TarifasA3aVerdeDto,
    required: false,
  })
  @IsOptional()
  a3a_verde?: TarifasA3aVerdeDto;

  @ApiProperty({
    description: 'Tarifas para o grupo B',
    type: TarifasBDto,
    required: false,
  })
  @IsOptional()
  b?: TarifasBDto;
}

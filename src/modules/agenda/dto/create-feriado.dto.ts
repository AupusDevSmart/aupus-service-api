import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  IsDate,
  Length,
  ArrayMinSize,
  ValidateIf
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TipoFeriado {
  NACIONAL = 'NACIONAL',
  ESTADUAL = 'ESTADUAL',
  MUNICIPAL = 'MUNICIPAL',
  PERSONALIZADO = 'PERSONALIZADO'
}

export class CreateFeriadoDto {
  @ApiProperty({
    description: 'Nome do feriado',
    example: 'Natal'
  })
  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @Length(2, 255, { message: 'Nome deve ter entre 2 e 255 caracteres' })
  nome: string;

  @ApiProperty({
    description: 'Data do feriado',
    example: '2024-12-25',
    type: Date
  })
  @IsDate({ message: 'Data deve ser uma data válida' })
  @Type(() => Date)
  data: Date;

  @ApiProperty({
    description: 'Tipo do feriado',
    enum: TipoFeriado,
    example: TipoFeriado.NACIONAL
  })
  @IsEnum(TipoFeriado, { message: 'Tipo deve ser NACIONAL, ESTADUAL, MUNICIPAL ou PERSONALIZADO' })
  tipo: TipoFeriado;

  @ApiPropertyOptional({
    description: 'Indica se o feriado se aplica a todas as plantas (geral) ou apenas às plantas especificadas',
    example: true,
    default: false
  })
  @IsBoolean({ message: 'Geral deve ser verdadeiro ou falso' })
  @IsOptional()
  geral?: boolean = false;

  @ApiPropertyOptional({
    description: 'Indica se o feriado se repete anualmente',
    example: true,
    default: false
  })
  @IsBoolean({ message: 'Recorrente deve ser verdadeiro ou falso' })
  @IsOptional()
  recorrente?: boolean = false;

  @ApiPropertyOptional({
    description: 'Descrição adicional do feriado',
    example: 'Feriado nacional comemorativo do nascimento de Jesus Cristo'
  })
  @IsString({ message: 'Descrição deve ser uma string' })
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({
    description: 'IDs das plantas associadas ao feriado (obrigatório quando geral = false)',
    example: ['plt_01234567890123456789012345', 'plt_09876543210987654321098765'],
    type: [String]
  })
  @IsArray({ message: 'PlantaIds deve ser um array' })
  @ArrayMinSize(1, { message: 'Pelo menos uma planta deve ser especificada quando não for feriado geral' })
  @IsString({ each: true, message: 'Cada plantaId deve ser uma string válida' })
  @ValidateIf(o => !o.geral, { message: 'PlantaIds é obrigatório quando o feriado não for geral' })
  @IsOptional()
  plantaIds?: string[];
}
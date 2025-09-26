import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  Length,
  ArrayMinSize,
  ValidateIf
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConfiguracaoDiasUteisDto {
  @ApiProperty({
    description: 'Nome da configuração',
    example: 'Horário Comercial Padrão'
  })
  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @Length(2, 255, { message: 'Nome deve ter entre 2 e 255 caracteres' })
  nome: string;

  @ApiPropertyOptional({
    description: 'Descrição da configuração',
    example: 'Configuração padrão para plantas industriais com funcionamento de segunda a sexta'
  })
  @IsString({ message: 'Descrição deve ser uma string' })
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({
    description: 'Segunda-feira é dia útil',
    example: true,
    default: true
  })
  @IsBoolean({ message: 'Segunda deve ser verdadeiro ou falso' })
  @IsOptional()
  segunda?: boolean = true;

  @ApiPropertyOptional({
    description: 'Terça-feira é dia útil',
    example: true,
    default: true
  })
  @IsBoolean({ message: 'Terça deve ser verdadeiro ou falso' })
  @IsOptional()
  terca?: boolean = true;

  @ApiPropertyOptional({
    description: 'Quarta-feira é dia útil',
    example: true,
    default: true
  })
  @IsBoolean({ message: 'Quarta deve ser verdadeiro ou falso' })
  @IsOptional()
  quarta?: boolean = true;

  @ApiPropertyOptional({
    description: 'Quinta-feira é dia útil',
    example: true,
    default: true
  })
  @IsBoolean({ message: 'Quinta deve ser verdadeiro ou falso' })
  @IsOptional()
  quinta?: boolean = true;

  @ApiPropertyOptional({
    description: 'Sexta-feira é dia útil',
    example: true,
    default: true
  })
  @IsBoolean({ message: 'Sexta deve ser verdadeiro ou falso' })
  @IsOptional()
  sexta?: boolean = true;

  @ApiPropertyOptional({
    description: 'Sábado é dia útil',
    example: false,
    default: false
  })
  @IsBoolean({ message: 'Sábado deve ser verdadeiro ou falso' })
  @IsOptional()
  sabado?: boolean = false;

  @ApiPropertyOptional({
    description: 'Domingo é dia útil',
    example: false,
    default: false
  })
  @IsBoolean({ message: 'Domingo deve ser verdadeiro ou falso' })
  @IsOptional()
  domingo?: boolean = false;

  @ApiPropertyOptional({
    description: 'Indica se a configuração se aplica a todas as plantas (geral) ou apenas às plantas especificadas',
    example: false,
    default: false
  })
  @IsBoolean({ message: 'Geral deve ser verdadeiro ou falso' })
  @IsOptional()
  geral?: boolean = false;

  @ApiPropertyOptional({
    description: 'IDs das plantas associadas à configuração (obrigatório quando geral = false)',
    example: ['plt_01234567890123456789012345', 'plt_09876543210987654321098765'],
    type: [String]
  })
  @IsArray({ message: 'PlantaIds deve ser um array' })
  @ArrayMinSize(1, { message: 'Pelo menos uma planta deve ser especificada quando não for configuração geral' })
  @IsString({ each: true, message: 'Cada plantaId deve ser uma string válida' })
  @ValidateIf(o => !o.geral, { message: 'PlantaIds é obrigatório quando a configuração não for geral' })
  @IsOptional()
  plantaIds?: string[];
}
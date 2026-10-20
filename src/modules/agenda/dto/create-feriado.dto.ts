import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  Length,
  ArrayMinSize,
  ValidateIf
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoFeriado } from '@/core';
import { DiaComoData } from '@/common/decorators/dia-de-calendario';

// O enum e o do banco. A copia local que existia aqui tinha os mesmos valores,
// mas para o TypeScript era outro tipo e nao aceitava o `tipo` lido do Prisma.
export { TipoFeriado };

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
  @DiaComoData({ obrigatoria: true })
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
  geral?: boolean;

  @ApiPropertyOptional({
    description: 'Indica se o feriado se repete anualmente',
    example: true,
    default: false
  })
  @IsBoolean({ message: 'Recorrente deve ser verdadeiro ou falso' })
  @IsOptional()
  recorrente?: boolean;

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
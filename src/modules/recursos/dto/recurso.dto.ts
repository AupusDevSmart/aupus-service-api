// src/modules/recursos/dto/recurso.dto.ts
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
  Min,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

/**
 * As mesmas cinco de sempre. No banco o enum se chama TipoRecurso e continua
 * assim: renomear enum em Postgres e migracao com risco, e a tela ja diz
 * "Categoria", que e o nome que interessa a quem usa.
 */
export enum CategoriaRecurso {
  PECA = 'PECA',
  MATERIAL = 'MATERIAL',
  FERRAMENTA = 'FERRAMENTA',
  TECNICO = 'TECNICO',
  VIATURA = 'VIATURA',
}

export class CreateRecursoDto {
  @ApiProperty({ enum: CategoriaRecurso, example: CategoriaRecurso.TECNICO })
  @IsEnum(CategoriaRecurso, { message: 'Categoria inválida' })
  categoria: CategoriaRecurso;

  @ApiProperty({ example: 'Eletricista' })
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @MaxLength(200, { message: 'Nome deve ter no máximo 200 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @ApiPropertyOptional({ example: 'h', description: 'Unidade a que o preço se refere.' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Unidade deve ter no máximo 20 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  unidade?: string | null;

  @ApiPropertyOptional({
    example: 85.5,
    description: 'Custo médio por unidade. Vazio significa preço desconhecido, não zero.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Preço deve ter no máximo 2 casas decimais' })
  @Min(0, { message: 'Preço não pode ser negativo' })
  preco_medio?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class UpdateRecursoDto extends PartialType(CreateRecursoDto) {}

export class QueryRecursosDto {
  @ApiPropertyOptional({ enum: CategoriaRecurso })
  @IsOptional()
  @IsEnum(CategoriaRecurso, { message: 'Categoria inválida' })
  categoria?: CategoriaRecurso;

  @ApiPropertyOptional({ description: 'Busca por nome.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ description: 'Só os ativos. Sem isso, vêm todos.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  apenas_ativos?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

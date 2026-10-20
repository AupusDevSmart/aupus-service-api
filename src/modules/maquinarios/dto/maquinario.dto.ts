// src/modules/maquinarios/dto/maquinario.dto.ts
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';
import { BooleanoDoTexto } from '@/common/decorators/booleano';
import { RUBRICAS } from '../../recursos/regras-do-recurso';
import { BASES, TIPOS } from '../regras-do-maquinario';

/** O maior valor de DECIMAL(12,2) e de DECIMAL(10,2): acima, o banco recusava com 500 */
const DECIMAL_12_2 = 9_999_999_999.99;
const DECIMAL_10_2 = 99_999_999.99;

const aparado = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

/** Os campos do maquinário do AupusProject (SN-84) */
export class CreateMaquinarioDto {
  @ApiProperty({ example: 'Betoneira 400 L' })
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  // 255, como o AupusProject: a planilha de lá não pode ser recusada aqui
  @MaxLength(255, { message: 'Nome deve ter no máximo 255 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @ApiProperty({ enum: TIPOS, description: 'Próprio (da empresa) ou locação (alugado).' })
  @IsIn(TIPOS, { message: 'Tipo inválido: próprio ou locação' })
  tipo: string;

  @ApiPropertyOptional({ description: 'Observação livre.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(aparado)
  descricao?: string | null;

  @ApiPropertyOptional({ enum: BASES, description: 'Como é cobrado. Vazio = por diária.' })
  @IsOptional()
  @IsIn(BASES, { message: 'Cobrança inválida' })
  base_calculo?: string;

  @ApiPropertyOptional({ enum: RUBRICAS, description: 'A linha do orçamento. Vazio = o padrão do tipo.' })
  @IsOptional()
  @IsIn(RUBRICAS, { message: 'Rubrica inválida' })
  rubrica?: string;

  @ApiPropertyOptional({ description: 'Preço por unidade da cobrança. Na máquina própria só vale quando falta a amortização.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_12_2, { message: 'Valor acima do que o cadastro guarda' })
  preco_unitario?: number | null;

  @ApiPropertyOptional({ description: 'O investimento a amortizar.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_12_2, { message: 'Valor acima do que o cadastro guarda' })
  valor_aquisicao?: number | null;

  @ApiPropertyOptional({ description: 'Em quantos meses o investimento se paga (1 a 600).' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  prazo_retorno_meses?: number | null;

  @ApiPropertyOptional({ description: 'Manutenção, seguro e licenças por ano.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_12_2, { message: 'Valor acima do que o cadastro guarda' })
  custos_anuais?: number | null;

  @ApiPropertyOptional({ description: 'Horas de uso previstas por ano.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_10_2, { message: 'Valor acima do que o cadastro guarda' })
  meta_utilizacao_horas?: number | null;

  @ApiPropertyOptional({ description: 'Quantas horas formam uma diária (1 a 24). Padrão 8.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  horas_por_diaria?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class UpdateMaquinarioDto extends PartialType(CreateMaquinarioDto) {}

export class QueryMaquinariosDto {
  @ApiPropertyOptional({ enum: TIPOS })
  @IsOptional()
  @IsIn(TIPOS, { message: 'Tipo inválido' })
  tipo?: string;

  @ApiPropertyOptional({ description: 'Busca por nome.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ description: 'Só os ativos. Sem isso, vêm todos.' })
  @IsOptional()
  @BooleanoDoTexto()
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
  @Max(100)
  limit?: number;
}

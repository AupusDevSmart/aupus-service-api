// src/modules/recursos/dto/recurso.dto.ts
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
  Max,
  Min,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';
import { BooleanoDoTexto } from '@/common/decorators/booleano';
import { BASES, RUBRICAS } from '../regras-do-recurso';
import { DECIMAL_10_2, DECIMAL_12_2 } from '@/common/helpers/limites-decimais';

/**
 * As 6 categorias do AupusProject (SN-83). No banco o enum continua se
 * chamando TipoRecurso; a tela diz "Categoria". Eram INSTRUMENTO, MATERIAL,
 * FERRAMENTA, TECNICO e VIATURA: o SQL 2026-10-20-recursos-como-no-aupusproject
 * converteu técnico em mão de obra, viatura em veículo e ferramenta em
 * instrumento.
 */
export enum CategoriaRecurso {
  MAO_DE_OBRA = 'MAO_DE_OBRA',
  MATERIAL = 'MATERIAL',
  INSTRUMENTO = 'INSTRUMENTO',
  VEICULO = 'VEICULO',
  TERCEIRO = 'TERCEIRO',
  DESPESA_CAMPO = 'DESPESA_CAMPO',
}

const aparado = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class CreateRecursoDto {
  @ApiProperty({ enum: CategoriaRecurso, example: CategoriaRecurso.MAO_DE_OBRA })
  @IsEnum(CategoriaRecurso, { message: 'Categoria inválida' })
  categoria: CategoriaRecurso;

  @ApiProperty({ example: 'Eletricista' })
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  // 255, como o AupusProject: a planilha de lá não pode ser recusada aqui
  @MaxLength(255, { message: 'Nome deve ter no máximo 255 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @ApiPropertyOptional({ example: 'Técnico', description: 'Só mão de obra: a função de quem executa.' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Função deve ter no máximo 255 caracteres' })
  @Transform(aparado)
  funcao?: string | null;

  @ApiPropertyOptional({ description: 'Observação livre.' })
  // Texto livre, como lá (o corpo da requisição tem o próprio limite)
  @IsOptional()
  @IsString()
  @Transform(aparado)
  descricao?: string | null;

  @ApiPropertyOptional({ example: 'm', description: 'Unidade de compra do material (m, un, kg...).' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Unidade deve ter no máximo 20 caracteres' })
  @Transform(aparado)
  unidade?: string | null;

  @ApiPropertyOptional({ enum: BASES, description: 'Como é cobrado. Fora da categoria, vale o padrão dela.' })
  @IsOptional()
  @IsIn(BASES, { message: 'Cobrança inválida' })
  base_calculo?: string;

  @ApiPropertyOptional({ enum: RUBRICAS, description: 'A linha do orçamento. Vazio = o padrão da categoria.' })
  @IsOptional()
  @IsIn(RUBRICAS, { message: 'Rubrica inválida' })
  rubrica?: string;

  @ApiPropertyOptional({ example: 85.5, description: 'Preço por unidade da cobrança. Vazio = sem preço, não zero.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2, { message: 'Preço deve ter no máximo 2 casas decimais' })
  @Min(0, { message: 'Preço não pode ser negativo' })
  @Max(DECIMAL_12_2)
  preco_unitario?: number | null;

  @ApiPropertyOptional({ description: 'Só instrumento: o investimento a amortizar.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_12_2)
  valor_aquisicao?: number | null;

  @ApiPropertyOptional({ description: 'Só instrumento: em quantos meses o investimento se paga (1 a 600).' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsInt({ message: 'Prazo de retorno deve ser inteiro (meses)' })
  @Min(1)
  @Max(600)
  prazo_retorno_meses?: number | null;

  @ApiPropertyOptional({ description: 'Só instrumento: manutenção, calibração, seguro e licenças por ano.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_12_2)
  custos_anuais?: number | null;

  @ApiPropertyOptional({ description: 'Só instrumento: horas de uso previstas por ano.' })
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_10_2)
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
  @BooleanoDoTexto()
  @IsBoolean()
  apenas_ativos?: boolean;

  @ApiPropertyOptional({ description: 'ATIVO ou INATIVO (o filtro da tela, 30/out/2026). Sem isso, vêm todos.', enum: ['ATIVO', 'INATIVO'] })
  @IsOptional()
  @IsIn(['ATIVO', 'INATIVO'], { message: 'Situação inválida: ATIVO ou INATIVO' })
  situacao?: 'ATIVO' | 'INATIVO';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Excluir vários de uma vez (30/out/2026, pedido do stakeholder: "excluir todos os
 * inativos de uma vez pela tela"). Ou os selecionados (`ids`), ou todos os inativos
 * do filtro da tela (`inativos`, com a categoria e a busca dela) — um dos dois.
 * Só exclui com `previa: false`; sem isso, diz o que sairia e o que ficaria (em uso).
 */
export class ExcluirRecursosEmLoteDto {
  @ApiPropertyOptional({ description: 'Os recursos selecionados (até 500)', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500, { message: 'No máximo 500 recursos por vez' })
  @IsString({ each: true })
  @MaxLength(26, { each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Todos os inativos do filtro (a categoria e a busca abaixo), em todas as páginas' })
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  inativos?: boolean;

  @ApiPropertyOptional({ enum: CategoriaRecurso, description: 'Com `inativos`: só os da categoria' })
  @IsOptional()
  @IsEnum(CategoriaRecurso, { message: 'Categoria inválida' })
  categoria?: CategoriaRecurso;

  @ApiPropertyOptional({ description: 'Com `inativos`: só os com o nome que contém isto' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ description: 'false exclui; sem isso (ou true), só diz o que sairia e o que ficaria' })
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  previa?: boolean;

  @ApiPropertyOptional({ description: 'Ao excluir: quantos a prévia disse que saem (outra quantidade hoje = 409)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  esperados?: number;
}

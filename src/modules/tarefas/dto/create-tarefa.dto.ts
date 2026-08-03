// src/modules/tarefas/dto/create-tarefa.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FrequenciaTarefa } from '@aupus/api-shared';

/**
 * A tarefa tem quatro campos: nome, instrucao, periodicidade e criticidade.
 *
 * Todo o conteudo — descricao, categoria, tipo de manutencao, condicao do
 * ativo, duracao e tempo estimado, sub-etapas e recursos — vive na INSTRUCAO.
 * A tarefa e o vinculo entre um plano e uma instrucao, com a periodicidade e a
 * criticidade daquele contexto. Para ver o detalhe do que sera feito, abre-se a
 * instrucao.
 *
 * As colunas antigas ainda existem no banco (o drop e a ultima etapa da
 * migracao) e sao preenchidas a partir da instrucao no momento da criacao.
 */
export class CreateTarefaDto {
  @ApiProperty({ description: 'Nome da tarefa neste plano', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome: string;

  @ApiProperty({ description: 'Instrucao que descreve o que deve ser feito' })
  @IsString()
  @IsNotEmpty()
  instrucao_id: string;

  @ApiProperty({ description: 'Periodicidade', enum: FrequenciaTarefa })
  @IsEnum(FrequenciaTarefa)
  frequencia: FrequenciaTarefa;

  @ApiPropertyOptional({ description: 'Intervalo em dias quando a periodicidade e PERSONALIZADA' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  frequencia_personalizada?: number;

  @ApiProperty({ description: 'Criticidade de 1 a 5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  criticidade: number;

  // ---- Contexto, resolvido pelo backend ou informado pela tela ----

  @ApiPropertyOptional({ description: 'Plano a que a tarefa pertence (template ou copia)' })
  @IsString()
  @IsOptional()
  plano_manutencao_id?: string;

  @ApiPropertyOptional({ description: 'Posicao no plano. Omitida, usa a proxima livre.' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  ordem?: number;

  @ApiPropertyOptional({ description: 'TAG. Omitida, e gerada automaticamente.' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  tag?: string;

  @IsString()
  @IsOptional()
  criado_por?: string;
}

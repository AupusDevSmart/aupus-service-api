// src/modules/instrucoes/dto/adicionar-ao-plano.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { FrequenciaTarefa } from '@aupus/api-shared';

export class AdicionarAoPlanoDto {
  @IsString()
  @IsNotEmpty()
  plano_manutencao_id: string;

  @IsEnum(FrequenciaTarefa)
  frequencia: FrequenciaTarefa;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  frequencia_personalizada?: number;

  // Opcional: quando omitida, o backend usa a proxima ordem livre do plano.
  // O cadastro rapido pela tabela de planos nao informa ordem.
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  ordem?: number;

  // Opcional: sobrescreve a criticidade herdada da instrucao.
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  criticidade?: number;

  @IsString()
  @IsOptional()
  criado_por?: string;
}

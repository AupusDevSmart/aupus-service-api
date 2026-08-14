// src/modules/instrucoes/dto/create-recurso-instrucao.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { TipoRecurso } from '@aupus/api-shared';
import { Transform } from 'class-transformer';

/**
 * Um recurso usado por uma instrução.
 *
 * O caminho novo é mandar só `recurso_id`: categoria, nome e unidade vêm do
 * catálogo, e o servidor copia para as colunas antigas — elas continuam sendo o
 * que a tela lê enquanto a migração não terminar.
 *
 * `tipo` e `descricao` seguem aceitos para as instruções que ainda não foram
 * passadas para o catálogo. Um dos dois caminhos precisa vir.
 */
export class CreateRecursoInstrucaoDto {
  @IsString()
  @IsOptional()
  recurso_id?: string;

  @IsEnum(TipoRecurso)
  @IsOptional()
  tipo?: TipoRecurso;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  quantidade?: number;

  @IsString()
  @IsOptional()
  unidade?: string;

  /** Quem decide se o recurso é indispensável é a instrução, não o catálogo. */
  @IsBoolean()
  @IsOptional()
  obrigatorio?: boolean = false;
}

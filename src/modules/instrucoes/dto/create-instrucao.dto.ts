// src/modules/instrucoes/dto/create-instrucao.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { StatusTarefa } from '@/core';
import { CreateSubInstrucaoDto } from './create-sub-instrucao.dto';
import { CreateMaquinarioInstrucaoDto, CreateRecursoInstrucaoDto } from './create-recurso-instrucao.dto';

const aparado = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

/**
 * A instrução com os campos do AupusProject (SN-85): código, nome, descrição,
 * frente, início D+X, duração em dias e ativo, e as listas de passos, recursos e
 * maquinários. Status e observações são só do Service.
 *
 * Sem inicializador (SN-12): o PartialType os copiaria para o Update e um PUT
 * parcial resetaria os campos. Os padrões de criação ficam no service.
 */
export class CreateInstrucaoDto {
  /** O código na empresa (era tag). Vazio, o service gera INST-NNN */
  @IsOptional()
  @Transform(aparado)
  @IsString()
  @MaxLength(50)
  codigo?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string | null;

  /** Frente de trabalho do cronograma (texto livre, como lá) */
  @IsOptional()
  @Transform(aparado)
  @IsString()
  @MaxLength(60)
  frente?: string | null;

  /** O X do D+X: dias corridos depois da data-base */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  prazo_inicio_relativo?: number;

  /** Dias que a instrução leva, inclusivos (mínimo 1: zero a tiraria do cronograma calada) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  duracao_dias?: number;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsEnum(StatusTarefa)
  @IsOptional()
  status?: StatusTarefa;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;

  // A autoria (criado_por, atualizado_por) sai do token, no controller: pelo
  // corpo, quem gravava escolhia em nome de quem (SN-85, como as associacoes no SN-40)

  // Sub-estruturas: vindo, a lista inteira é trocada
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubInstrucaoDto)
  @IsOptional()
  sub_instrucoes?: CreateSubInstrucaoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecursoInstrucaoDto)
  @IsOptional()
  recursos?: CreateRecursoInstrucaoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMaquinarioInstrucaoDto)
  @IsOptional()
  maquinarios?: CreateMaquinarioInstrucaoDto[];
}

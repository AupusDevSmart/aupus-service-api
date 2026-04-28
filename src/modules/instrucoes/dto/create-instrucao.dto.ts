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
import { Type, Transform } from 'class-transformer';
import {
  CategoriaTarefa,
  TipoManutencao,
  CondicaoAtivo,
  StatusTarefa
} from '@aupus/api-shared';
import { CreateSubInstrucaoDto } from './create-sub-instrucao.dto';
import { CreateRecursoInstrucaoDto } from './create-recurso-instrucao.dto';

export class CreateInstrucaoDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  tag?: string; // Se não fornecida, será gerada automaticamente (INST-001)

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome: string;

  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsEnum(CategoriaTarefa)
  categoria: CategoriaTarefa;

  @IsEnum(TipoManutencao)
  tipo_manutencao: TipoManutencao;

  @IsEnum(CondicaoAtivo)
  condicao_ativo: CondicaoAtivo;

  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  criticidade: number;

  @Transform(({ value }) => parseFloat(value))
  @Min(0.1)
  duracao_estimada: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  tempo_estimado: number;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsEnum(StatusTarefa)
  @IsOptional()
  status?: StatusTarefa = StatusTarefa.ATIVA;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean = true;

  @IsString()
  @IsOptional()
  criado_por?: string;

  // Sub-estruturas
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubInstrucaoDto)
  @IsOptional()
  sub_instrucoes?: CreateSubInstrucaoDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecursoInstrucaoDto)
  @IsOptional()
  recursos?: CreateRecursoInstrucaoDto[] = [];
}

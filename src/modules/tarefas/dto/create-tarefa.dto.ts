// src/modules/tarefas/dto/create-tarefa.dto.ts
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
  IsDecimal,
  IsDate
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { 
  CategoriaTarefa, 
  TipoManutencao, 
  FrequenciaTarefa, 
  CondicaoAtivo, 
  StatusTarefa 
} from '@prisma/client';
import { CreateSubTarefaDto } from './create-sub-tarefa.dto';
import { CreateRecursoTarefaDto } from './create-recurso-tarefa.dto';

export class CreateTarefaDto {
  @IsString()
  @IsNotEmpty()
  plano_manutencao_id: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tag?: string; // Se não fornecida, será gerada automaticamente

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

  @IsEnum(FrequenciaTarefa)
  frequencia: FrequenciaTarefa;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  frequencia_personalizada?: number;

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

  @IsInt()
  @Min(1)
  @Type(() => Number)
  ordem: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  planejador?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  responsavel?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsEnum(StatusTarefa)
  @IsOptional()
  status?: StatusTarefa = StatusTarefa.ATIVA;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean = true;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  data_ultima_execucao?: Date;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  numero_execucoes?: number = 0;

  @IsString()
  @IsOptional()
  criado_por?: string;

  @IsString()
  @IsOptional()
  equipamento_id?: string;

  @IsString()
  @IsOptional()
  planta_id?: string;

  // Sub-estruturas
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubTarefaDto)
  @IsOptional()
  sub_tarefas?: CreateSubTarefaDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecursoTarefaDto)
  @IsOptional()
  recursos?: CreateRecursoTarefaDto[] = [];
}
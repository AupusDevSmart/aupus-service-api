// src/modules/tarefas/dto/query-tarefas.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { 
  StatusTarefa, 
  CategoriaTarefa, 
  TipoManutencao,
  FrequenciaTarefa 
} from '@prisma/client';

export class QueryTarefasDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  plano_id?: string;

  @IsOptional()
  @IsString()
  equipamento_id?: string;

  @IsOptional()
  @IsString()
  planta_id?: string;

  @IsOptional()
  @IsString()
  unidade_id?: string;

  @IsOptional()
  @IsEnum(StatusTarefa)
  status?: StatusTarefa;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsEnum(CategoriaTarefa)
  categoria?: CategoriaTarefa;

  @IsOptional()
  @IsEnum(TipoManutencao)
  tipo_manutencao?: TipoManutencao;

  @IsOptional()
  @IsEnum(FrequenciaTarefa)
  frequencia?: FrequenciaTarefa;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  criticidade?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  status_atrasada?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sort_by?: string = 'created_at';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sort_order?: 'asc' | 'desc' = 'desc';
}
// src/modules/planos-manutencao/dto/create-plano-manutencao.dto.ts
import { IsString, IsOptional, IsEnum, IsDateString, IsNotEmpty, MaxLength, IsBoolean } from 'class-validator';
import { StatusPlano } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePlanoManutencaoDto {
  @IsString()
  @IsNotEmpty()
  equipamento_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  versao?: string;

  @IsEnum(StatusPlano)
  @IsOptional()
  status?: StatusPlano;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;

  @IsDateString()
  @IsOptional()
  data_vigencia_inicio?: string;

  @IsDateString()
  @IsOptional()
  data_vigencia_fim?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsString()
  @IsOptional()
  criado_por?: string;
}
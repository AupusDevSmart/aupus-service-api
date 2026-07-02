// src/modules/planos-manutencao/dto/create-plano-manutencao.dto.ts
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

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

  @IsString()
  @IsOptional()
  criado_por?: string;
}
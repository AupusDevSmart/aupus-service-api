// src/modules/planos-manutencao/dto/duplicar-plano.dto.ts
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class DuplicarPlanoDto {
  @IsString()
  @IsNotEmpty()
  equipamento_destino_id: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  novo_nome?: string;

  @IsString()
  @IsOptional()
  novo_prefixo_tag?: string; // Para gerar novas TAGs

  @IsString()
  @IsOptional()
  criado_por?: string;
}
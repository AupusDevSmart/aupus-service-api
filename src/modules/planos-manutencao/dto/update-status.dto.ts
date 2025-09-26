// src/modules/planos-manutencao/dto/update-status.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusPlano } from '@prisma/client';

export class UpdateStatusPlanoDto {
  @IsEnum(StatusPlano)
  status: StatusPlano;

  @IsString()
  @IsOptional()
  atualizado_por?: string;
}
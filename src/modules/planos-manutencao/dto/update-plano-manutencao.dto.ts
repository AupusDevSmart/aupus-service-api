// src/modules/planos-manutencao/dto/update-plano-manutencao.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePlanoManutencaoDto } from './create-plano-manutencao.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdatePlanoManutencaoDto extends PartialType(CreatePlanoManutencaoDto) {
  @IsString()
  @IsOptional()
  atualizado_por?: string;
}
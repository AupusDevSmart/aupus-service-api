// src/modules/instrucoes/dto/update-status-instrucao.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusTarefa } from '@aupus/api-shared';

export class UpdateStatusInstrucaoDto {
  @IsEnum(StatusTarefa)
  status: StatusTarefa;

  @IsString()
  @IsOptional()
  atualizado_por?: string;
}

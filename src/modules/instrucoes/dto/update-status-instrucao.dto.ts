// src/modules/instrucoes/dto/update-status-instrucao.dto.ts
import { IsEnum } from 'class-validator';
import { StatusTarefa } from '@/core';

/** O autor da alteracao sai do token (SN-85), nao do corpo */
export class UpdateStatusInstrucaoDto {
  @IsEnum(StatusTarefa)
  status: StatusTarefa;
}

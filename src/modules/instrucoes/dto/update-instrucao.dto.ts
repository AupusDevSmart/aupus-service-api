// src/modules/instrucoes/dto/update-instrucao.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateInstrucaoDto } from './create-instrucao.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdateInstrucaoDto extends PartialType(CreateInstrucaoDto) {
  @IsString()
  @IsOptional()
  atualizado_por?: string;
}

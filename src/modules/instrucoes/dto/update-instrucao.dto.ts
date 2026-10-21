// src/modules/instrucoes/dto/update-instrucao.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateInstrucaoDto } from './create-instrucao.dto';

/** O autor da alteracao sai do token (SN-85), nao do corpo */
export class UpdateInstrucaoDto extends PartialType(CreateInstrucaoDto) {}

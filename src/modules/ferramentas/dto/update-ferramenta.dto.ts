// ===============================
// src/modules/ferramentas/dto/update-ferramenta.dto.ts
// ===============================
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFerramentaDto } from './create-ferramenta.dto';

export class UpdateFerramentaDto extends PartialType(
  OmitType(CreateFerramentaDto, ['organizacao_nome', 'codigo_patrimonial'])
) {}
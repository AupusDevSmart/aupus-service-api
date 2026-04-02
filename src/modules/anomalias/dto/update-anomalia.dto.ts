// src/modules/anomalias/dto/update-anomalia.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateAnomaliaDto } from './create-anomalia.dto';

export class UpdateAnomaliaDto extends PartialType(CreateAnomaliaDto) {}
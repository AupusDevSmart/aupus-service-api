// src/modules/anomalias/dto/update-anomalia.dto.ts
import { PartialType, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { CreateAnomaliaDto, StatusAnomalia } from './create-anomalia.dto';

export class UpdateAnomaliaDto extends PartialType(CreateAnomaliaDto) {
  @ApiProperty({
    description: 'Status da anomalia',
    enum: StatusAnomalia,
    required: false,
    example: StatusAnomalia.EM_ANALISE
  })
  @IsOptional()
  @IsEnum(StatusAnomalia)
  status?: StatusAnomalia;
}
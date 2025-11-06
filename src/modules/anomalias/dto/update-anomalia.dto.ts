// src/modules/anomalias/dto/update-anomalia.dto.ts
import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';
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

  // ✅ NOVO: Campos de análise
  @ApiPropertyOptional({
    description: 'Observações registradas durante a análise da anomalia',
    example: 'Anomalia analisada e aprovada para geração de OS'
  })
  @IsOptional()
  @IsString()
  observacoes_analise?: string;

  @ApiPropertyOptional({
    description: 'Nome do usuário que analisou a anomalia',
    example: 'João Silva'
  })
  @IsOptional()
  @IsString()
  analisado_por?: string;

  @ApiPropertyOptional({
    description: 'Data e hora em que a anomalia foi analisada',
    example: '2025-11-03T14:30:00Z'
  })
  @IsOptional()
  @IsDateString()
  data_analise?: string;
}
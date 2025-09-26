// src/modules/anomalias/dto/anomalia-stats.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class AnomaliaStatsDto {
  @ApiProperty({ description: 'Total de anomalias' })
  total: number;

  @ApiProperty({ description: 'Anomalias aguardando' })
  aguardando: number;

  @ApiProperty({ description: 'Anomalias em análise' })
  emAnalise: number;

  @ApiProperty({ description: 'Anomalias com OS gerada' })
  osGerada: number;

  @ApiProperty({ description: 'Anomalias resolvidas' })
  resolvida: number;

  @ApiProperty({ description: 'Anomalias canceladas' })
  cancelada: number;

  @ApiProperty({ description: 'Anomalias críticas' })
  criticas: number;
}
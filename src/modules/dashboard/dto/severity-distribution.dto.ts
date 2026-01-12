import { ApiProperty } from '@nestjs/swagger';

export class DashboardSeverityDistributionDto {
  @ApiProperty({ description: 'Anomalias de prioridade baixa', example: 25 })
  baixa: number;

  @ApiProperty({ description: 'Anomalias de prioridade média', example: 45 })
  media: number;

  @ApiProperty({ description: 'Anomalias de prioridade alta', example: 20 })
  alta: number;

  @ApiProperty({ description: 'Anomalias de prioridade crítica', example: 30 })
  critica: number;

  @ApiProperty({ description: 'Total de anomalias', example: 120 })
  total_anomalias: number;
}

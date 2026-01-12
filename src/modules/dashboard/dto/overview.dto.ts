import { ApiProperty } from '@nestjs/swagger';

export class DashboardOverviewDto {
  @ApiProperty({ description: 'Total de equipamentos', example: 30 })
  total_equipamentos: number;

  @ApiProperty({ description: 'Equipamentos com falhas', example: 5 })
  equipamentos_com_falhas: number;

  @ApiProperty({ description: 'Equipamentos parados', example: 2 })
  equipamentos_parados: number;

  @ApiProperty({ description: 'Ordens de serviço abertas', example: 8 })
  os_abertas: number;

  @ApiProperty({ description: 'Ordens de serviço em execução', example: 4 })
  os_em_execucao: number;

  @ApiProperty({ description: 'Ordens de serviço finalizadas', example: 12 })
  os_finalizadas: number;
}

import { ApiProperty } from '@nestjs/swagger';

class MesComparacaoDto {
  @ApiProperty({ description: 'Nome do mês', example: 'Jan' })
  mes: string;

  @ApiProperty({ description: 'Número do mês (1-12)', example: 1 })
  mes_numero: number;

  @ApiProperty({ description: 'Ordens de serviço planejadas', example: 15 })
  planejadas: number;

  @ApiProperty({ description: 'Ordens de serviço concluídas', example: 12 })
  concluidas: number;

  @ApiProperty({ description: 'Taxa de conclusão (%)', example: 80 })
  taxa_conclusao: number;
}

export class DashboardPlannedVsCompletedDto {
  @ApiProperty({
    description: 'Comparação mensal dos últimos 6 meses',
    type: [MesComparacaoDto]
  })
  meses: MesComparacaoDto[];

  @ApiProperty({ description: 'Total planejado no período', example: 90 })
  total_planejadas: number;

  @ApiProperty({ description: 'Total concluído no período', example: 75 })
  total_concluidas: number;

  @ApiProperty({ description: 'Taxa de conclusão média (%)', example: 83.3 })
  taxa_conclusao_media: number;
}

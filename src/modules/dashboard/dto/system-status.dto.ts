import { ApiProperty } from '@nestjs/swagger';

export class DashboardSystemStatusDto {
  @ApiProperty({ description: 'Paradas programadas (TODO: definir critério)', example: 0 })
  paradas_programadas: number;

  @ApiProperty({ description: 'Equipamentos com status crítico', example: 2 })
  equipamentos_status_critico: number;

  @ApiProperty({ description: 'Equipamentos críticos (classificacao)', example: 3 })
  equipamentos_classe_critica: number;

  @ApiProperty({ description: 'Paradas não programadas (TODO: definir critério)', example: 0 })
  paradas_nao_programadas: number;

  @ApiProperty({ description: 'Falhas causando danos', example: 3 })
  falhas_causando_danos: number;

  @ApiProperty({ description: 'Sensores danificados (TODO: definir critério)', example: 0 })
  sensores_danificados: number;
}

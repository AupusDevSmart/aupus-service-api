import { ApiProperty } from '@nestjs/swagger';

export class DashboardWorkOrdersDto {
  @ApiProperty({ description: 'Ordens de serviço abertas', example: 8 })
  os_abertas: number;

  @ApiProperty({ description: 'Nota de qualidade média (0-100)', example: 75 })
  nota_qualidade: number;

  @ApiProperty({ description: 'Ordens de serviço atrasadas', example: 1 })
  os_atrasadas: number;

  @ApiProperty({ description: 'Ordens de serviço finalizadas', example: 12 })
  os_finalizadas: number;

  @ApiProperty({ description: 'Indicador de carga de trabalho (0-100)', example: 75 })
  indicador_carga_trabalho: number;
}

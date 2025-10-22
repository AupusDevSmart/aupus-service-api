import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoUnidade } from './create-unidade.dto';
import { StatusUnidade } from './update-unidade.dto';

export class PlantaBasica {
  @ApiProperty({ example: 'plt_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'Planta Industrial São Paulo' })
  nome: string;

  @ApiPropertyOptional({ example: 'São Paulo - SP' })
  localizacao?: string;
}

export class UnidadeResponse {
  @ApiProperty({ example: 'uni_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'plt_01234567890123456789012345' })
  plantaId: string;

  @ApiProperty({ example: 'Unidade Fotovoltaica 1' })
  nome: string;

  @ApiProperty({ enum: TipoUnidade, example: TipoUnidade.UFV })
  tipo: TipoUnidade;

  @ApiProperty({ example: 'SP' })
  estado: string;

  @ApiProperty({ example: 'São Paulo' })
  cidade: string;

  @ApiProperty({ example: -23.5505 })
  latitude: number;

  @ApiProperty({ example: -46.6333 })
  longitude: number;

  @ApiProperty({ example: 1000.5, description: 'Potência em kW' })
  potencia: number;

  @ApiProperty({ enum: StatusUnidade, example: StatusUnidade.ativo })
  status: StatusUnidade;

  @ApiPropertyOptional({
    type: [String],
    example: ['Entrada', 'Saída', 'Transformador 1'],
  })
  pontosMedicao?: string[];

  @ApiPropertyOptional({ type: PlantaBasica })
  planta?: PlantaBasica;

  @ApiPropertyOptional({ example: 0, description: 'Total de equipamentos' })
  totalEquipamentos?: number;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  criadoEm: Date;

  @ApiProperty({ example: '2024-01-20T15:45:00Z' })
  atualizadoEm: Date;
}

export class PaginatedUnidadesResponse {
  @ApiProperty({ type: [UnidadeResponse] })
  data: UnidadeResponse[];

  @ApiProperty({
    example: {
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
    },
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

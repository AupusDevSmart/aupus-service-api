// src/modules/anomalias/dto/anomalia-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { CondicaoAnomalia, OrigemAnomalia, PrioridadeAnomalia, StatusAnomalia } from './create-anomalia.dto';
import { AnexoAnomaliaResponseDto } from './anexo-anomalia.dto';
export class AnomaliaResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  descricao: string;

  @ApiProperty()
  local: string;

  @ApiProperty()
  ativo: string;

  @ApiProperty()
  data: Date;

  @ApiProperty({ enum: CondicaoAnomalia })
  condicao: CondicaoAnomalia;

  @ApiProperty({ enum: OrigemAnomalia })
  origem: OrigemAnomalia;

  @ApiProperty({ enum: StatusAnomalia })
  status: StatusAnomalia;

  @ApiProperty({ enum: PrioridadeAnomalia })
  prioridade: PrioridadeAnomalia;

  @ApiProperty({ required: false })
  observacoes?: string;

  @ApiProperty({ required: false })
  criado_por?: string;

  @ApiProperty({ required: false })
  ordem_servico_id?: string;

  @ApiProperty({ required: false })
  planta_id?: string;

  @ApiProperty({ required: false })
  equipamento_id?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({ required: false })
  deleted_at?: Date;

  // Relacionamentos opcionais
  @ApiProperty({ required: false })
  planta?: any;

  @ApiProperty({ required: false })
  equipamento?: any;

  @ApiProperty({ required: false })
  usuario?: any;

  @ApiProperty({ required: false, type: [Object] })
  historico?: any[];

  @ApiProperty({ required: false, type: [AnexoAnomaliaResponseDto] })
  anexos?: AnexoAnomaliaResponseDto[];
}
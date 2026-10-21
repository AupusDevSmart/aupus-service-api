// src/modules/anomalias/dto/anomalia-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { CondicaoAnomalia, OrigemAnomalia, PrioridadeAnomalia } from './create-anomalia.dto';
import { StatusAnomalia, Prisma, type plantas, type usuarios, type historico_anomalias } from '@/core';
import { AnexoAnomaliaResponseDto } from './anexo-anomalia.dto';

/** O equipamento como o service o inclui: com a unidade e a planta dela */
type EquipamentoDaAnomalia = Prisma.equipamentosGetPayload<{
  include: {
    unidade: { select: { id: true; nome: true; planta_id: true; planta: { select: { id: true; nome: true } } } };
  };
}>;

/** O vinculo com a instrucao como o service o inclui */
type InstrucaoDaAnomalia = Prisma.anomalias_instrucoesGetPayload<{
  include: { instrucao: { select: { id: true; codigo: true; nome: true; status: true; ativo: true } } };
}>;

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
  planta?: plantas;

  @ApiProperty({ required: false })
  equipamento?: EquipamentoDaAnomalia;

  @ApiProperty({ required: false })
  usuario?: usuarios;

  @ApiProperty({ required: false, type: [Object] })
  historico?: historico_anomalias[];

  @ApiProperty({ required: false, type: [AnexoAnomaliaResponseDto] })
  anexos?: AnexoAnomaliaResponseDto[];

  @ApiProperty({ required: false, type: [Object], description: 'Instruções associadas a esta anomalia' })
  anomalias_instrucoes?: InstrucaoDaAnomalia[];
}
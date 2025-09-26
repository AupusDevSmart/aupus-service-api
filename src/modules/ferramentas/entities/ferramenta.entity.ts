// ===============================
// src/modules/ferramentas/entities/ferramenta.entity.ts
// ===============================
import { ApiProperty } from '@nestjs/swagger';
import { StatusFerramenta } from '../dto/create-ferramenta.dto';

export class FerramentaEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organizacao_nome: string;

  @ApiProperty()
  nome: string;

  @ApiProperty()
  codigo_patrimonial: string;

  @ApiProperty()
  tipo: string;

  @ApiProperty()
  fabricante: string;

  @ApiProperty()
  modelo: string;

  @ApiProperty()
  numero_serie: string;

  @ApiProperty()
  necessita_calibracao: boolean;

  @ApiProperty({ nullable: true })
  proxima_data_calibracao?: Date;

  @ApiProperty()
  localizacao_atual: string;

  @ApiProperty()
  responsavel_id: string;

  @ApiProperty({ nullable: true })
  planta_nome?: string;

  @ApiProperty()
  data_aquisicao: Date;

  @ApiProperty({ nullable: true })
  valor_aquisicao?: number;

  @ApiProperty({ enum: StatusFerramenta })
  status: StatusFerramenta;

  @ApiProperty({ nullable: true })
  observacoes?: string;

  @ApiProperty({ nullable: true })
  foto_url?: string;

  @ApiProperty({ nullable: true })
  manual_url?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({ nullable: true })
  deleted_at?: Date;

  // Campos calculados
  @ApiProperty({ nullable: true })
  diasParaVencimentoCalibracao?: number;

  @ApiProperty()
  statusCalibracao: 'ok' | 'vencendo' | 'vencida' | 'sem_data' | 'nao_necessita';

  // Relacionamentos (opcional)
  responsavel?: {
    id: string;
    nome: string;
    email: string;
  };

  historicoCalibracao?: any[];
  historicoManutencao?: any[];
}
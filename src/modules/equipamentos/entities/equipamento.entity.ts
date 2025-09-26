import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DadoTecnico {
  @ApiProperty({ example: 'dt_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'potencia' })
  campo: string;

  @ApiProperty({ example: '15' })
  valor: string;

  @ApiProperty({ example: 'number' })
  tipo: string;

  @ApiPropertyOptional({ example: 'kW' })
  unidade?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}

export class PlantaBasica {
  @ApiProperty({ example: 'plt_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'Planta Industrial São Paulo' })
  nome: string;
}

export class ProprietarioBasico {
  @ApiProperty({ example: 'usr_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'Empresa ABC Ltda' })
  nome: string;

  @ApiProperty({ example: '12.345.678/0001-90' })
  cpf_cnpj: string;
}

export class EquipamentoPai {
  @ApiProperty({ example: 'eqp_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'Sistema de Controle Principal' })
  nome: string;

  @ApiProperty({ example: 'UC' })
  classificacao: string;

  @ApiProperty({ example: '5' })
  criticidade: string;
}

export class ComponenteUAR {
  @ApiProperty({ example: 'eqp_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'Sensor de Temperatura' })
  nome: string;

  @ApiProperty({ example: 'UAR' })
  classificacao: string;
}

export class Equipamento {
  @ApiProperty({ example: 'eqp_01234567890123456789012345' })
  id: string;

  @ApiProperty({ example: 'Motor Elétrico Principal' })
  nome: string;

  @ApiProperty({ example: 'UC', enum: ['UC', 'UAR'] })
  classificacao: string;

  @ApiPropertyOptional({ example: 'plt_01234567890123456789012345' })
  planta_id?: string;

  @ApiPropertyOptional({ example: 'usr_01234567890123456789012345' })
  proprietario_id?: string;

  @ApiPropertyOptional({ example: 'eqp_01234567890123456789012345' })
  equipamento_pai_id?: string;

  @ApiPropertyOptional({ example: 'WEG' })
  fabricante?: string;

  @ApiPropertyOptional({ example: 'W22-15HP' })
  modelo?: string;

  @ApiPropertyOptional({ example: 'WEG2024001' })
  numero_serie?: string;

  @ApiProperty({ example: '3', enum: ['1', '2', '3', '4', '5'] })
  criticidade: string;

  @ApiPropertyOptional({ example: 'motor_inducao' })
  tipo_equipamento?: string;

  @ApiPropertyOptional({ example: 'sim' })
  em_operacao?: string;

  @ApiPropertyOptional({ example: 'linear' })
  tipo_depreciacao?: string;

  @ApiPropertyOptional()
  data_imobilizacao?: Date;

  @ApiPropertyOptional()
  data_instalacao?: Date;

  @ApiPropertyOptional({ example: 15000.00 })
  valor_imobilizado?: number;

  @ApiPropertyOptional({ example: 1500.00 })
  valor_depreciacao?: number;

  @ApiPropertyOptional({ example: 13500.00 })
  valor_contabil?: number;

  @ApiPropertyOptional({ example: 10 })
  vida_util?: number;

  @ApiPropertyOptional({ example: 'Fornecedor ABC' })
  fornecedor?: string;

  @ApiPropertyOptional({ example: 'CC-001' })
  centro_custo?: string;

  @ApiPropertyOptional({ example: 'PM-001' })
  plano_manutencao?: string;

  @ApiPropertyOptional({ example: 'Área de Produção' })
  localizacao?: string;

  @ApiPropertyOptional({ example: 'Lado direito do motor' })
  localizacao_especifica?: string;

  @ApiPropertyOptional({ example: 'Observações gerais' })
  observacoes?: string;

  @ApiPropertyOptional({ example: false })
  mcpse?: boolean;

  @ApiPropertyOptional({ example: 'TUC-001' })
  tuc?: string;

  @ApiPropertyOptional({ example: 'A1-VALUE' })
  a1?: string;

  @ApiPropertyOptional({ example: 'A2-VALUE' })
  a2?: string;

  @ApiPropertyOptional({ example: 'A3-VALUE' })
  a3?: string;

  @ApiPropertyOptional({ example: 'A4-VALUE' })
  a4?: string;

  @ApiPropertyOptional({ example: 'A5-VALUE' })
  a5?: string;

  @ApiPropertyOptional({ example: 'A6-VALUE' })
  a6?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiPropertyOptional()
  deleted_at?: Date;

  // Relacionamentos
  @ApiPropertyOptional({ type: PlantaBasica })
  planta?: PlantaBasica;

  @ApiPropertyOptional({ type: ProprietarioBasico })
  proprietario?: ProprietarioBasico;

  @ApiPropertyOptional({ type: EquipamentoPai })
  equipamento_pai?: EquipamentoPai;

  @ApiPropertyOptional({ type: [ComponenteUAR] })
  componentes_uar?: ComponenteUAR[];

  @ApiPropertyOptional({ type: [DadoTecnico] })
  dados_tecnicos?: DadoTecnico[];

  @ApiPropertyOptional({ example: 5 })
  totalComponentes?: number;
}
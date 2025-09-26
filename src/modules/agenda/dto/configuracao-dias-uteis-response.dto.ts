import { PlantaResumoDto } from './shared.dto';

export class ConfiguracaoDiasUteisResponseDto {
  id: string;
  nome: string;
  descricao?: string;
  segunda: boolean;
  terca: boolean;
  quarta: boolean;
  quinta: boolean;
  sexta: boolean;
  sabado: boolean;
  domingo: boolean;
  geral: boolean;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;

  // Relacionamentos
  plantas?: PlantaResumoDto[];
  total_plantas?: number;

  // Campos calculados
  total_dias_uteis?: number;
  dias_uteis_semana?: string[];
}
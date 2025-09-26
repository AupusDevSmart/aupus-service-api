import { TipoFeriado } from './create-feriado.dto';
import { PlantaResumoDto } from './shared.dto';

export class FeriadoResponseDto {
  id: string;
  nome: string;
  data: Date;
  tipo: TipoFeriado;
  geral: boolean;
  recorrente: boolean;
  descricao?: string;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;

  // Relacionamentos
  plantas?: PlantaResumoDto[];
  total_plantas?: number;
}
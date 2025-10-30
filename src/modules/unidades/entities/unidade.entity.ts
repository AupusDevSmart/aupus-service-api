import { TipoUnidade, StatusUnidade } from '../dto/create-unidade.dto';

export class Unidade {
  id: string;
  plantaId: string;
  nome: string;
  tipo: TipoUnidade;
  estado: string;
  cidade: string;
  latitude: number;
  longitude: number;
  potencia: number;
  status: StatusUnidade;
  pontosMedicao?: string[];
  criadoEm: Date;
  atualizadoEm: Date;
  deletadoEm?: Date | null;
}

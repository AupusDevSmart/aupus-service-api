import { TipoAnexo } from '@aupus/api-shared';

export class AnexoInstrucaoDetalhesDto {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  url: string;
  tamanho?: number;
  content_type?: string;
  instrucao_id: string;
  created_at: Date;
  updated_at: Date;
}

import { TipoAnexo } from '@prisma/client';

export class AnexoTarefaDetalhesDto {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  url: string;
  tamanho?: number;
  content_type?: string;
  tarefa_id: string;
  created_at: Date;
  updated_at: Date;
}
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO para clonar um plano de manutenção para múltiplos equipamentos
 */
export class ClonarPlanoLoteDto {
  @IsArray()
  @IsString({ each: true })
  equipamentos_destino_ids: string[]; // Array de IDs de equipamentos destino

  @IsOptional()
  @IsString()
  @MaxLength(50)
  novo_prefixo_tag?: string; // Prefixo para gerar TAGs únicas (ex: "INV-02")

  @IsOptional()
  @IsBoolean()
  manter_nome_original?: boolean; // Se true, mantém nome do plano; se false, adiciona sufixo com nome do equipamento

  @IsOptional()
  @IsString()
  criado_por?: string; // ID do usuário que está criando
}

/**
 * Interface para detalhes de cada equipamento no processo de clonagem
 */
export interface DetalheClonagem {
  equipamento_id: string;
  equipamento_nome: string;
  sucesso: boolean;
  plano_id?: string;
  plano_nome?: string;
  total_tarefas?: number;
  erro?: string;
}

/**
 * DTO de resposta da clonagem em lote
 */
export class ClonarPlanoLoteResponseDto {
  planos_criados: number;
  planos_com_erro: number;
  detalhes: DetalheClonagem[];
}

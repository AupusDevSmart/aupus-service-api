import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const MOTIVOS_NEXON = ['FALHA', 'ALARME', 'CAMPO', 'OUTRO'] as const;
export const PRIORIDADES_NEXON = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const;

/**
 * O chamado como o NexON manda (contrato em aupus-nexon-api/docs/CHAMADOS.md).
 *
 * Os ids de planta, unidade, equipamento e proprietario sao os do NexON — que
 * sao os mesmos daqui quando o registro foi sincronizado. Nem todo registro e:
 * so a planta e obrigatoria, o resto vira texto na solicitacao se faltar.
 */
export class ChamadoNexonDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  nexon_chamado_id: string;

  @IsInt()
  numero: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  titulo: string;

  @IsNotEmpty()
  @IsString()
  descricao: string;

  @IsOptional()
  @IsIn(MOTIVOS_NEXON)
  motivo?: (typeof MOTIVOS_NEXON)[number] | null;

  @IsOptional()
  @IsIn(PRIORIDADES_NEXON)
  prioridade?: (typeof PRIORIDADES_NEXON)[number] | null;

  @IsOptional()
  @IsString()
  equipamento_id?: string | null;

  @IsOptional()
  @IsString()
  unidade_id?: string | null;

  @IsNotEmpty()
  @IsString()
  planta_id: string;

  @IsOptional()
  @IsString()
  proprietario_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  autor_nome?: string | null;

  @IsOptional()
  @IsDateString()
  aberto_em?: string | null;

  @IsOptional()
  @IsString()
  observacao?: string | null;
}

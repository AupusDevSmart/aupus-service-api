import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { InstanteComFuso } from '@/common/decorators/instante';

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

  // Os tetos com folga sobre os do NexON (5000 e 1000): sem eles, só os 2 MB do corpo
  @IsNotEmpty()
  @IsString()
  @MaxLength(10000)
  descricao: string;

  @IsOptional()
  @IsIn(MOTIVOS_NEXON)
  motivo?: (typeof MOTIVOS_NEXON)[number] | null;

  @IsOptional()
  @IsIn(PRIORIDADES_NEXON)
  prioridade?: (typeof PRIORIDADES_NEXON)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  equipamento_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unidade_id?: string | null;

  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  planta_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  proprietario_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  autor_nome?: string | null;

  // Com o fuso: sem ele, o @IsDateString de antes lia "2026-10-20T10:00" no fuso do servidor (SN-74)
  @IsOptional()
  @InstanteComFuso()
  aberto_em?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string | null;
}

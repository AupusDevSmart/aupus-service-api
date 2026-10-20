import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PERIODOS_DO_PAINEL = ['12meses', 'mes', 'trimestre', 'ano'] as const;
export type PeriodoDoPainel = (typeof PERIODOS_DO_PAINEL)[number];

/**
 * Os filtros do painel de manutenção (SN-79). Era uma interface, que o pipe não
 * confere: período desconhecido caía calado nos 12 meses. "all" é "sem filtro"
 * (o que a tela manda quando o combo está em "Todas").
 */
export class QueryDashboardManutencaoDto {
  @ApiPropertyOptional({ enum: PERIODOS_DO_PAINEL, default: '12meses' })
  @IsOptional()
  @IsIn(PERIODOS_DO_PAINEL)
  periodo?: PeriodoDoPainel;

  // Sem @Length(26): ids antigos têm 25 caracteres (cuid)
  @ApiPropertyOptional({ description: 'Planta (ou "all")' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  plantaId?: string;

  @ApiPropertyOptional({ description: 'Instalação (ou "all")' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unidadeId?: string;

  @ApiPropertyOptional({ description: 'Equipe (o texto de time_equipe, ou "all")' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  equipe?: string;

  @ApiPropertyOptional({ description: 'Criticidade do equipamento, 1 a 5 (ou "all")' })
  @IsOptional()
  @IsIn(['1', '2', '3', '4', '5', 'all'])
  criticidade?: string;
}

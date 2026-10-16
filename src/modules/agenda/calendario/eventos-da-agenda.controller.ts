import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { TipoOS } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser, Permissions } from '@/core';
import { FORMATO_DO_DIA as DIA, periodoDaAgenda } from '../dia-do-calendario';
import { EventosDaAgendaService, type UsuarioDaAgenda } from './eventos-da-agenda.service';

/** Mês, semana ou a lista de um trimestre: mais que isso o calendário não pede. */
const DIAS_NO_MAXIMO = 100;

export class EventosDaAgendaDto {
  @ApiProperty({ example: '2026-11-01', description: 'Primeiro dia (data de calendário, em Brasília)' })
  @IsString()
  @Matches(DIA, { message: 'inicio deve ser uma data AAAA-MM-DD' })
  inicio: string;

  @ApiProperty({ example: '2026-11-30', description: 'Último dia, inclusive' })
  @IsString()
  @Matches(DIA, { message: 'fim deve ser uma data AAAA-MM-DD' })
  fim: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  planta_id?: string;

  @ApiPropertyOptional({ description: 'O equipamento e os componentes dele' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  equipamento_id?: string;

  @ApiPropertyOptional({ enum: TipoOS })
  @IsOptional()
  @IsEnum(TipoOS)
  tipo?: TipoOS;
}

/**
 * O calendário de manutenção (SN-52): programações, OS e a previsão do
 * gerador num período, nas plantas que a pessoa enxerga.
 */
@ApiTags('agenda')
@Controller('agenda/eventos')
// Tarefas, programações e OS: é manutenção, não só feriado (agenda.view)
@Permissions('manutencao.view')
export class EventosDaAgendaController {
  constructor(private readonly eventos: EventosDaAgendaService) {}

  @Get()
  @ApiOperation({ summary: 'Eventos do calendário: programações, OS e previsão das preventivas' })
  listar(@Query() dto: EventosDaAgendaDto, @CurrentUser() user?: UsuarioDaAgenda) {
    const { inicio, fim } = periodoDaAgenda(dto.inicio, dto.fim, DIAS_NO_MAXIMO);
    return this.eventos.listar({ inicio, fim, plantaId: dto.planta_id, equipamentoId: dto.equipamento_id, tipo: dto.tipo }, user);
  }
}

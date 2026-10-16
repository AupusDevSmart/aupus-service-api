import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser, Permissions, type ScopedUser } from '@/core';
import { PrevisaoDaAgendaService } from './previsao-da-agenda.service';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Um ano e pouco: o calendário pede um mês ou uma semana; a previsão de 12 meses cabe. */
const DIAS_NO_MAXIMO = 400;

export class PrevisaoDaAgendaDto {
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
}

/** O dia de calendário em Brasília, como a regra de dias úteis (fuso fixo -03:00). */
const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00.000-03:00`);
const fimDoDia = (dia: string) => new Date(`${dia}T23:59:59.999-03:00`);

/**
 * A previsão dos ciclos das tarefas no período (SN-51): o que o gerador vai
 * programar, quando, e o que já está programado. Lê quem vê a agenda, nas
 * plantas que enxerga.
 */
@ApiTags('agenda')
@Controller('agenda/previsao')
@Permissions('agenda.view', 'agenda.manage')
export class PrevisaoDaAgendaController {
  constructor(private readonly previsao: PrevisaoDaAgendaService) {}

  @Get()
  @ApiOperation({ summary: 'Previsão dos ciclos das tarefas, pela regra do gerador de preventivas' })
  prever(@Query() dto: PrevisaoDaAgendaDto, @CurrentUser() user?: ScopedUser) {
    const inicio = inicioDoDia(dto.inicio);
    const fim = fimDoDia(dto.fim);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) throw new BadRequestException('Data inválida');
    if (fim.getTime() < inicio.getTime()) throw new BadRequestException('O fim vem antes do início');
    if (fim.getTime() - inicio.getTime() > DIAS_NO_MAXIMO * 86_400_000) {
      throw new BadRequestException(`O período vai até ${DIAS_NO_MAXIMO} dias`);
    }
    return this.previsao.prever({ inicio, fim, plantaId: dto.planta_id, equipamentoId: dto.equipamento_id }, user);
  }
}

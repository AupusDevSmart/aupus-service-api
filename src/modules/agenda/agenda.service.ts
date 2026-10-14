import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core';
import { VerificarDiaUtilDto, ProximosDiasUteisDto } from './dto';
import { diaEmBrasilia, feriadoDoDia, regraDeDiasUteis, type RegraDeDiasUteis } from './dias-uteis';

export interface DiaUtilResponse {
  data: Date;
  ehDiaUtil: boolean;
  ehFeriado: boolean;
  nomeFeriado?: string;
  diaSemana: string;
  configuracao?: {
    id: string;
    nome: string;
  };
}

export interface ProximosDiasUteisResponse {
  diasUteis: Date[];
  diasEncontrados: number;
  dataInicio: Date;
  configuracaoUsada?: {
    id: string;
    nome: string;
  };
}

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * Data só de calendário ("2026-10-19") chega como meia-noite UTC, que em
 * Brasília ainda é o dia anterior. Lida como meio-dia de Brasília, o dia é o
 * que a pessoa escolheu.
 */
function comoDiaDoCalendario(data: Date): Date {
  const meiaNoiteUtc =
    data.getUTCHours() === 0 && data.getUTCMinutes() === 0 && data.getUTCSeconds() === 0 && data.getUTCMilliseconds() === 0;
  return meiaNoiteUtc ? new Date(data.getTime() + 15 * 60 * 60 * 1000) : data;
}

/**
 * Consultas de dia útil da agenda. A regra é a de dias-uteis.ts — a mesma que
 * o gerador automático de programações usa —, carregada uma vez por consulta
 * (antes cada dia do calendário fazia duas idas ao banco).
 */
@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async verificarDiaUtil(dto: VerificarDiaUtilDto): Promise<DiaUtilResponse> {
    return this.avaliar(comoDiaDoCalendario(new Date(dto.data)), await regraDeDiasUteis(this.prisma, dto.plantaId));
  }

  async obterProximosDiasUteis(dto: ProximosDiasUteisDto): Promise<ProximosDiasUteisResponse> {
    const { quantidade, dataInicio = new Date(), plantaId } = dto;
    const regra = await regraDeDiasUteis(this.prisma, plantaId);

    const diasUteis: Date[] = [];
    const inicio = comoDiaDoCalendario(new Date(dataInicio));
    for (let i = 0; diasUteis.length < quantidade && i < quantidade * 10; i++) {
      const dia = new Date(inicio.getTime() + i * DIA_MS);
      if (this.avaliar(dia, regra).ehDiaUtil) diasUteis.push(dia);
    }

    return {
      diasUteis,
      diasEncontrados: diasUteis.length,
      dataInicio: new Date(dataInicio),
      configuracaoUsada: regra.configuracao,
    };
  }

  async calcularDiasUteisEntreDatas(dataInicio: Date, dataFim: Date, plantaId?: string): Promise<number> {
    const regra = await regraDeDiasUteis(this.prisma, plantaId);
    const fim = comoDiaDoCalendario(new Date(dataFim)).getTime();
    let contador = 0;
    for (let dia = comoDiaDoCalendario(new Date(dataInicio)); dia.getTime() <= fim; dia = new Date(dia.getTime() + DIA_MS)) {
      if (this.avaliar(dia, regra).ehDiaUtil) contador++;
    }
    return contador;
  }

  async adicionarDiasUteis(dataBase: Date, diasUteis: number, plantaId?: string): Promise<Date> {
    const regra = await regraDeDiasUteis(this.prisma, plantaId);
    let dia = comoDiaDoCalendario(new Date(dataBase));
    let adicionados = 0;
    for (let tentativas = 0; adicionados < diasUteis && tentativas < diasUteis * 10; tentativas++) {
      dia = new Date(dia.getTime() + DIA_MS);
      if (this.avaliar(dia, regra).ehDiaUtil) adicionados++;
    }
    return dia;
  }

  /** Um item por dia do mês, ao meio-dia de Brasília (o dia certo em qualquer fuso do navegador). */
  async obterCalendarioMes(ano: number, mes: number, plantaId?: string): Promise<DiaUtilResponse[]> {
    const regra = await regraDeDiasUteis(this.prisma, plantaId);
    const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return Array.from({ length: diasNoMes }, (_, i) => this.avaliar(new Date(Date.UTC(ano, mes - 1, i + 1, 15)), regra));
  }

  private avaliar(data: Date, regra: RegraDeDiasUteis): DiaUtilResponse {
    const dia = diaEmBrasilia(data);
    const feriado = feriadoDoDia(dia, regra.feriados);
    return {
      data,
      ehDiaUtil: !!regra.diasDaSemana[dia.diaDaSemana] && !feriado,
      ehFeriado: !!feriado,
      nomeFeriado: feriado?.nome,
      diaSemana: DIAS_DA_SEMANA[dia.diaDaSemana],
      configuracao: regra.configuracao,
    };
  }
}

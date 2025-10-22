import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class EquipamentosDataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém o dado mais recente de um equipamento
   */
  async obterDadoAtual(equipamentoId: string) {
    // Verificar se o equipamento existe
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId, deleted_at: null },
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // Buscar último dado
    const ultimoDado = await this.prisma.equipamentos_dados.findFirst({
      where: { equipamento_id: equipamentoId },
      orderBy: { timestamp_dados: 'desc' },
    });

    if (!ultimoDado) {
      throw new NotFoundException(
        'Nenhum dado encontrado para este equipamento',
      );
    }

    return this.formatDadoResponse(ultimoDado);
  }

  /**
   * Obtém histórico de dados de um equipamento
   */
  async obterHistorico(
    equipamentoId: string,
    options: {
      inicio?: Date;
      fim?: Date;
      limite?: number;
      intervalo?: 'raw' | '1min' | '5min' | '1hour' | '1day';
    },
  ) {
    const { inicio, fim, limite = 100, intervalo = 'raw' } = options;

    // Verificar se o equipamento existe
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId, deleted_at: null },
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // Construir filtro de datas
    const whereClause: any = {
      equipamento_id: equipamentoId,
    };

    if (inicio || fim) {
      whereClause.timestamp_dados = {};
      if (inicio) whereClause.timestamp_dados.gte = inicio;
      if (fim) whereClause.timestamp_dados.lte = fim;
    }

    // Buscar dados
    const dados = await this.prisma.equipamentos_dados.findMany({
      where: whereClause,
      orderBy: { timestamp_dados: 'desc' },
      take: limite,
    });

    // TODO: Implementar agrupamento por intervalo
    // Por enquanto retorna raw data
    const dadosFormatados = dados.map((dado) => ({
      timestamp: dado.timestamp_dados,
      dados: dado.dados,
      qualidade: dado.qualidade,
      fonte: dado.fonte,
    }));

    return {
      dados: dadosFormatados,
      meta: {
        total: dadosFormatados.length,
        inicio: inicio || null,
        fim: fim || null,
        intervalo,
        equipamentoId,
      },
    };
  }

  /**
   * Formata resposta de um dado
   */
  private formatDadoResponse(dado: any) {
    return {
      id: dado.id,
      equipamentoId: dado.equipamento_id,
      dados: dado.dados,
      fonte: dado.fonte,
      timestamp: dado.timestamp_dados,
      qualidade: dado.qualidade,
    };
  }
}

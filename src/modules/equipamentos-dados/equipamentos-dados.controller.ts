import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { EquipamentosDadosService } from './equipamentos-dados.service';
import { EquipamentoDadosQueryDto } from './dto/equipamento-dados-query.dto';

@Controller('equipamentos-dados')
export class EquipamentosDadosController {
  private readonly logger = new Logger(EquipamentosDadosController.name);

  constructor(private readonly service: EquipamentosDadosService) {}

  /**
   * GET /equipamentos-dados/:id/latest
   * Retorna o dado mais recente de um equipamento
   */
  @Get(':id/latest')
  async getLatest(@Param('id') id: string) {
    this.logger.log(`GET /equipamentos-dados/${id}/latest`);
    return this.service.findLatest(id);
  }

  /**
   * GET /equipamentos-dados/:id/history
   * Retorna o histórico de dados de um equipamento
   */
  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @Query() query: EquipamentoDadosQueryDto,
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/history`);
    return this.service.findHistory(id, query);
  }

  /**
   * GET /equipamentos-dados/:id/stats
   * Retorna estatísticas de dados de um equipamento
   */
  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    this.logger.log(`GET /equipamentos-dados/${id}/stats`);
    return this.service.getStats(id);
  }

  /**
   * GET /equipamentos-dados/:id/grafico-dia
   * Retorna dados para gráfico do dia (curva de potência)
   */
  @Get(':id/grafico-dia')
  async getGraficoDia(
    @Param('id') id: string,
    @Query('data') data?: string, // formato: YYYY-MM-DD (opcional, default: hoje)
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/grafico-dia?data=${data || 'hoje'}`);
    return this.service.getGraficoDia(id, data);
  }

  /**
   * GET /equipamentos-dados/:id/grafico-mes
   * Retorna dados para gráfico do mês (energia por dia)
   */
  @Get(':id/grafico-mes')
  async getGraficoMes(
    @Param('id') id: string,
    @Query('mes') mes?: string, // formato: YYYY-MM (opcional, default: mês atual)
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/grafico-mes?mes=${mes || 'atual'}`);
    return this.service.getGraficoMes(id, mes);
  }

  /**
   * GET /equipamentos-dados/:id/grafico-ano
   * Retorna dados para gráfico do ano (energia por mês)
   */
  @Get(':id/grafico-ano')
  async getGraficoAno(
    @Param('id') id: string,
    @Query('ano') ano?: string, // formato: YYYY (opcional, default: ano atual)
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/grafico-ano?ano=${ano || 'atual'}`);
    return this.service.getGraficoAno(id, ano);
  }
}

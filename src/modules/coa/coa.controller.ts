import { Controller, Get, Query, UseGuards, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CoaService, DashboardData } from './coa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('COA - Centro de Operações')
@Controller('coa')
@UseGuards(JwtAuthGuard)
export class CoaController {
  private readonly logger = new Logger(CoaController.name);

  constructor(private readonly coaService: CoaService) {}

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obter dados do dashboard COA',
    description: 'Retorna dados agregados de todas as plantas e unidades para o Centro de Operações Avançadas'
  })
  @ApiQuery({
    name: 'clienteId',
    required: false,
    description: 'ID do cliente para filtrar dados (opcional)',
    type: String
  })
  @ApiResponse({
    status: 200,
    description: 'Dados do dashboard retornados com sucesso'
  })
  async getDashboardData(@Query('clienteId') clienteId?: string): Promise<DashboardData> {
    this.logger.log(`[COA Controller] GET /dashboard - clienteId: ${clienteId || 'none'}`);
    const result = await this.coaService.getDashboardData(clienteId);
    this.logger.log(`[COA Controller] Dashboard data returned - ${result.plantas.length} plantas, ${result.resumoGeral.totalUnidades} unidades`);
    return result;
  }

  @Get('dashboard/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forçar atualização do cache',
    description: 'Remove o cache e busca dados frescos do banco de dados'
  })
  @ApiQuery({
    name: 'clienteId',
    required: false,
    description: 'ID do cliente para filtrar dados (opcional)',
    type: String
  })
  @ApiResponse({
    status: 200,
    description: 'Cache atualizado e dados retornados'
  })
  async refreshDashboard(@Query('clienteId') clienteId?: string): Promise<DashboardData> {
    return this.coaService.refreshCache(clienteId);
  }
}
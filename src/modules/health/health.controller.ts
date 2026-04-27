import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { AlertService } from './alert.service';
import { Public } from '@aupus/api-shared';
import { PrismaService } from '@aupus/api-shared';

@ApiTags('Health Check')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly alertService: AlertService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check geral do sistema' })
  @ApiResponse({ status: 200, description: 'Sistema saudavel' })
  @ApiResponse({ status: 503, description: 'Sistema com problemas' })
  async check() {
    return this.healthService.checkHealth();
  }

  @Get('database')
  @Public()
  @ApiOperation({ summary: 'Health check do banco de dados' })
  @ApiResponse({ status: 200, description: 'Banco conectado' })
  @ApiResponse({ status: 503, description: 'Banco desconectado' })
  async checkDatabase() {
    return this.healthService.checkDatabaseHealth();
  }

  @Get('alerts')
  @Public()
  @ApiOperation({ summary: 'Retorna historico de alertas' })
  @ApiResponse({ status: 200, description: 'Historico de alertas' })
  async getAlerts() {
    return {
      alerts: this.alertService.getAlertHistory(),
      total: this.alertService.getAlertHistory().length,
    };
  }

  @Post('alerts/check')
  @Public()
  @ApiOperation({ summary: 'Forca verificacao manual do sistema' })
  @ApiResponse({ status: 200, description: 'Verificacao executada' })
  async triggerManualCheck() {
    await this.alertService.triggerManualCheck();
    return {
      message: 'Verificacao manual executada com sucesso',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics/database')
  @Public()
  @ApiOperation({ summary: 'Retorna metricas de queries do banco de dados' })
  @ApiResponse({ status: 200, description: 'Metricas de queries do banco' })
  async getDatabaseMetrics() {
    return {
      database: this.prismaService.getQueryMetrics(),
      timestamp: new Date().toISOString(),
    };
  }
}

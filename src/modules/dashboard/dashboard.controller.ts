import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardSimpleService } from './dashboard-simple.service';
import { Public } from '../auth/decorators/public.decorator';
import { DashboardOverviewDto } from './dto/overview.dto';
import { DashboardWorkOrdersDto } from './dto/work-orders.dto';
import { DashboardTaskPrioritiesDto } from './dto/task-priorities.dto';
import { DashboardSeverityDistributionDto } from './dto/severity-distribution.dto';
import { DashboardPlannedVsCompletedDto } from './dto/planned-vs-completed.dto';
import { DashboardSystemStatusDto } from './dto/system-status.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly dashboardSimpleService: DashboardSimpleService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Retorna visão geral do dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Visão geral retornada com sucesso',
    type: DashboardOverviewDto,
  })
  async getOverview(): Promise<DashboardOverviewDto> {
    return this.dashboardService.getOverview();
  }

  @Get('work-orders')
  @ApiOperation({ summary: 'Retorna métricas de ordens de serviço' })
  @ApiResponse({
    status: 200,
    description: 'Métricas de OS retornadas com sucesso',
    type: DashboardWorkOrdersDto,
  })
  async getWorkOrders(): Promise<DashboardWorkOrdersDto> {
    return this.dashboardService.getWorkOrders();
  }

  @Get('task-priorities')
  @ApiOperation({ summary: 'Retorna tarefas ordenadas por criticidade' })
  @ApiResponse({
    status: 200,
    description: 'Tarefas prioritárias retornadas com sucesso',
    type: DashboardTaskPrioritiesDto,
  })
  async getTaskPriorities(): Promise<DashboardTaskPrioritiesDto> {
    return this.dashboardService.getTaskPriorities();
  }

  @Get('severity-distribution')
  @ApiOperation({ summary: 'Retorna distribuição de anomalias por prioridade' })
  @ApiResponse({
    status: 200,
    description: 'Distribuição de prioridades retornada com sucesso',
    type: DashboardSeverityDistributionDto,
  })
  async getSeverityDistribution(): Promise<DashboardSeverityDistributionDto> {
    return this.dashboardService.getSeverityDistribution();
  }

  @Get('planned-vs-completed')
  @ApiOperation({
    summary: 'Retorna comparação de OS planejadas vs concluídas (últimos 6 meses)',
  })
  @ApiResponse({
    status: 200,
    description: 'Comparação retornada com sucesso',
    type: DashboardPlannedVsCompletedDto,
  })
  async getPlannedVsCompleted(): Promise<DashboardPlannedVsCompletedDto> {
    return this.dashboardService.getPlannedVsCompleted();
  }

  @Get('system-status')
  @ApiOperation({
    summary: 'Retorna status do sistema',
    description:
      'NOTA: Alguns campos retornam 0 (TODO) pois precisam de definição de regra de negócio',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do sistema retornado com sucesso',
    type: DashboardSystemStatusDto,
  })
  async getSystemStatus(): Promise<DashboardSystemStatusDto> {
    return this.dashboardService.getSystemStatus();
  }

  @Get('advanced')
  @Public()
  @ApiOperation({
    summary: 'Dashboard avançado com métricas detalhadas',
    description: 'Retorna dados consolidados de todos os módulos com suporte a filtros contextuais',
  })
  @ApiQuery({ name: 'usuarioId', required: false, description: 'ID do usuário' })
  @ApiQuery({ name: 'proprietarioId', required: false, description: 'ID do proprietário' })
  @ApiQuery({ name: 'plantaId', required: false, description: 'ID da planta' })
  @ApiQuery({ name: 'unidadeId', required: false, description: 'ID da unidade' })
  @ApiQuery({
    name: 'periodo',
    required: false,
    enum: ['hoje', '7dias', '30dias', '6meses', 'ano', 'custom'],
    description: 'Período para análise',
  })
  @ApiQuery({ name: 'dataInicio', required: false, description: 'Data inicial (formato ISO)' })
  @ApiQuery({ name: 'dataFim', required: false, description: 'Data final (formato ISO)' })
  async getAdvancedDashboard(@Query() filters: any) {
    // Usar o serviço simplificado enquanto o avançado tem erros
    return this.dashboardSimpleService.getSimpleDashboard(filters);
  }
}

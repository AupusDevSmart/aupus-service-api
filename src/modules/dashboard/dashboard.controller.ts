import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardSimpleService } from './dashboard-simple.service';
import { Public, Permissions, CurrentUser } from '@aupus/api-shared';
import { DashboardOverviewDto } from './dto/overview.dto';
import { DashboardWorkOrdersDto } from './dto/work-orders.dto';
import { DashboardTaskPrioritiesDto } from './dto/task-priorities.dto';
import { DashboardSeverityDistributionDto } from './dto/severity-distribution.dto';
import { DashboardPlannedVsCompletedDto } from './dto/planned-vs-completed.dto';
import { DashboardSystemStatusDto } from './dto/system-status.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
@Permissions('dashboard.view')
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
  async getOverview(@CurrentUser() user: any): Promise<DashboardOverviewDto> {
    return this.dashboardService.getOverview(user);
  }

  @Get('work-orders')
  @ApiOperation({ summary: 'Retorna métricas de ordens de serviço' })
  @ApiResponse({
    status: 200,
    description: 'Métricas de OS retornadas com sucesso',
    type: DashboardWorkOrdersDto,
  })
  async getWorkOrders(@CurrentUser() user: any): Promise<DashboardWorkOrdersDto> {
    return this.dashboardService.getWorkOrders(user);
  }

  @Get('task-priorities')
  @ApiOperation({ summary: 'Retorna tarefas ordenadas por criticidade' })
  @ApiResponse({
    status: 200,
    description: 'Tarefas prioritárias retornadas com sucesso',
    type: DashboardTaskPrioritiesDto,
  })
  async getTaskPriorities(@CurrentUser() user: any): Promise<DashboardTaskPrioritiesDto> {
    return this.dashboardService.getTaskPriorities(user);
  }

  @Get('severity-distribution')
  @ApiOperation({ summary: 'Retorna distribuição de anomalias por prioridade' })
  @ApiResponse({
    status: 200,
    description: 'Distribuição de prioridades retornada com sucesso',
    type: DashboardSeverityDistributionDto,
  })
  async getSeverityDistribution(@CurrentUser() user: any): Promise<DashboardSeverityDistributionDto> {
    return this.dashboardService.getSeverityDistribution(user);
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
  async getPlannedVsCompleted(@CurrentUser() user: any): Promise<DashboardPlannedVsCompletedDto> {
    return this.dashboardService.getPlannedVsCompleted(user);
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
  async getSystemStatus(@CurrentUser() user: any): Promise<DashboardSystemStatusDto> {
    return this.dashboardService.getSystemStatus(user);
  }

  @Get('advanced')
  @ApiOperation({
    summary: 'Dashboard avançado com métricas detalhadas',
    description: 'Retorna dados consolidados de todos os módulos, com filtro por escopo do usuário.',
  })
  @ApiQuery({ name: 'plantaId', required: false })
  @ApiQuery({ name: 'unidadeId', required: false })
  @ApiQuery({ name: 'periodo', required: false, enum: ['hoje', '7dias', '30dias', '6meses', 'ano', 'custom'] })
  async getAdvancedDashboard(@Query() filters: any, @CurrentUser() user: any) {
    return this.dashboardSimpleService.getSimpleDashboard(filters, user);
  }
}

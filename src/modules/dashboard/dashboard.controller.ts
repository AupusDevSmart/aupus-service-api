import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DashboardManutencaoService } from './dashboard-manutencao.service';
import { QueryDashboardManutencaoDto } from './dto/query-dashboard-manutencao.dto';
import { Permissions, CurrentUser, ScopedUser } from '@/core';

/**
 * O painel de manutenção. Saíram em 20/out/2026 (SN-79) o `/dashboard/advanced`
 * (o `getSimpleDashboard`, que ignorava os filtros) e os seis endpoints do
 * `DashboardService` (overview, work-orders...): nenhuma tela os chamava.
 */
@ApiTags('Dashboard')
@Controller('dashboard')
@Permissions('dashboard.view')
export class DashboardController {
  constructor(private readonly dashboardManutencaoService: DashboardManutencaoService) {}

  @Get('manutencao')
  @ApiOperation({
    summary: 'Painel de gestão de manutenção e serviços',
    description:
      'Agrega tudo o que a tela mostra numa chamada só. Indicadores sem fonte no banco vêm ' +
      'com `simulado: true` e o campo `pendencia` dizendo o que falta registrar para ' +
      'que passem a ser reais.',
  })
  async getDashboardManutencao(@Query() filtros: QueryDashboardManutencaoDto, @CurrentUser() user: ScopedUser) {
    return this.dashboardManutencaoService.getDashboard(filtros, user);
  }
}

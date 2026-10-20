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

  // OS por OS, com custo: a permissão de ver OS (a do painel só entrega agregados).
  // A do método substitui a da classe; na matriz, todo papel com o painel já a tem
  @Get('manutencao/ordens')
  @Permissions('execucao_os.view')
  @ApiOperation({
    summary: 'As OS que entraram nas contas do painel',
    description:
      'Para a exportação do painel (SN-82): com os mesmos filtros e o mesmo escopo, cada OS que ' +
      'entra em algum número — aberta agora, concluída, criada ou programada no período, ou com ' +
      'a parada no período —, com as horas estimadas e o custo por natureza.',
  })
  async getOrdensDaConta(@Query() filtros: QueryDashboardManutencaoDto, @CurrentUser() user: ScopedUser) {
    return this.dashboardManutencaoService.getOrdensDaConta(filtros, user);
  }
}

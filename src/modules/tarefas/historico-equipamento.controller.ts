import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HistoricoEquipamentoService } from './historico-equipamento.service';

/**
 * Vive no AupusService porque ordem de serviço só existe aqui — o api-shared
 * tem o schema, mas os módulos de OS e programação são deste backend. Por isso
 * a aba Histórico do sheet do equipamento também é injetada pelo Service, e o
 * NexOn não a exibe.
 *
 * Compartilhar o prefixo `/equipamentos` com o controller do api-shared é
 * seguro: esta rota tem três segmentos e não colide com o `@Get(':id')` de lá.
 */
@ApiTags('Equipamentos')
@Controller('equipamentos')
export class HistoricoEquipamentoController {
  constructor(private readonly historicoService: HistoricoEquipamentoService) {}

  @Get(':id/historico-os')
  @ApiOperation({
    summary: 'Ordens de serviço e programações que tocaram este equipamento',
  })
  @ApiResponse({ status: 200, description: 'Histórico do equipamento' })
  async listar(@Param('id') id: string) {
    // As duas visoes numa chamada so: a situacao de cada tarefa (o que falta) e
    // as ordens que passaram pelo equipamento (o que ja foi feito).
    const [tarefas, ordens] = await Promise.all([
      this.historicoService.situacaoDasTarefas(id),
      this.historicoService.listar(id),
    ]);

    return { tarefas, ordens };
  }
}

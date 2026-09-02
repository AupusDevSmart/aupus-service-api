import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AtivosFuncionaisService } from './ativos-funcionais.service';
import {
  CriarAtivoFuncionalDto,
  InstalarEquipamentoDto,
  ListarAtivosFuncionaisDto,
  RemoverEquipamentoDto,
  TransferirEquipamentoDto,
} from './dto/ativo-funcional.dto';

/**
 * As POSICOES e o vinculo delas com os equipamentos.
 *
 * Instalar, remover e transferir sao POST e nao PATCH de proposito: nenhuma
 * delas edita um registro. Cada uma fecha e/ou abre um vinculo, que e como o
 * historico da posicao se preserva — um PATCH sugeriria que da para "corrigir"
 * o vinculo anterior, e e justamente isso que nao pode acontecer.
 */
@ApiTags('Ativos Funcionais')
@Controller('ativos-funcionais')
export class AtivosFuncionaisController {
  constructor(private readonly service: AtivosFuncionaisService) {}

  private usuarioDe(req: any): string | undefined {
    return req?.user?.id ?? req?.user?.sub;
  }

  @Get()
  @ApiOperation({
    summary: 'Listar posicoes',
    description:
      'Cada posicao vem com `ocupada` e o equipamento ativo. E o que permite avisar ' +
      'que a posicao ja tem equipamento no momento da escolha, e nao depois do submit.',
  })
  @ApiResponse({ status: 200, description: 'Posicoes com o estado de ocupacao' })
  async listar(@Query() query: ListarAtivosFuncionaisDto) {
    return this.service.listar({ unidade_id: query.unidade_id });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar posicao',
    description: 'Traz o equipamento ativo e os anteriores separados — a tela trata os dois de forma diferente.',
  })
  @ApiResponse({ status: 404, description: 'Posicao nao encontrada' })
  async buscarPorId(@Param('id') id: string) {
    return this.service.buscarPorId(id);
  }

  @Get(':id/historico')
  @ApiOperation({ summary: 'Tudo que ja passou pela posicao, do mais recente para o mais antigo' })
  async historico(@Param('id') id: string) {
    return this.service.historico(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar posicao' })
  async criar(@Body() dto: CriarAtivoFuncionalDto) {
    return this.service.criar(dto);
  }

  @Post(':id/instalar')
  @ApiOperation({ summary: 'Instalar um equipamento na posicao' })
  @ApiResponse({ status: 409, description: 'A posicao ja tem equipamento ativo' })
  async instalar(
    @Param('id') id: string,
    @Body() dto: InstalarEquipamentoDto,
    @Req() req: any,
  ) {
    return this.service.instalar(id, dto.equipamento_id, {
      usuarioId: this.usuarioDe(req),
    });
  }

  @Post(':id/remover')
  @ApiOperation({ summary: 'Remover o equipamento ativo, liberando a posicao' })
  @ApiResponse({ status: 404, description: 'A posicao nao tem equipamento ativo' })
  async remover(
    @Param('id') id: string,
    @Body() dto: RemoverEquipamentoDto,
    @Req() req: any,
  ) {
    return this.service.remover(id, { motivo: dto.motivo, usuarioId: this.usuarioDe(req) });
  }

  @Post('equipamentos/:equipamentoId/transferir')
  @ApiOperation({
    summary: 'Mover um equipamento para outra posicao',
    description:
      'Fecha o vinculo de origem e abre o de destino na mesma transacao. Se o destino ' +
      'estiver ocupado, a origem continua exatamente como estava.',
  })
  @ApiResponse({ status: 409, description: 'A posicao de destino ja tem equipamento ativo' })
  async transferir(
    @Param('equipamentoId') equipamentoId: string,
    @Body() dto: TransferirEquipamentoDto,
    @Req() req: any,
  ) {
    return this.service.transferir(equipamentoId, dto.ativo_funcional_id, {
      motivo: dto.motivo,
      usuarioId: this.usuarioDe(req),
    });
  }
}

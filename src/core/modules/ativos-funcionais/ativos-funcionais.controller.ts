import { Permissions } from '../auth/decorators/permissions.decorator';
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
import type { Request } from 'express';
import type { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionScopeService, type ScopedUser } from '../auth/permission-scope.service';
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
@Permissions('equipamentos.view', 'equipamentos.manage')
export class AtivosFuncionaisController {
  constructor(
    private readonly service: AtivosFuncionaisService,
    private readonly escopo: PermissionScopeService,
  ) {}

  private usuarioDe(req: Request): string | undefined {
    // `sub` e o nome do id no payload do token; o JwtStrategy entrega `id`
    const usuario = req?.user as (UsuarioAutenticado & { sub?: string }) | undefined;
    return usuario?.id ?? usuario?.sub;
  }

  @Get()
  @ApiOperation({
    summary: 'Listar posicoes',
    description:
      'Cada posicao vem com `ocupada` e o equipamento ativo. E o que permite avisar ' +
      'que a posicao ja tem equipamento no momento da escolha, e nao depois do submit.',
  })
  @ApiResponse({ status: 200, description: 'Posicoes com o estado de ocupacao' })
  async listar(@Query() query: ListarAtivosFuncionaisDto, @CurrentUser() user: ScopedUser) {
    // No escopo de quem pede: antes o técnico e o cliente listavam as posições
    // (e os equipamentos instalados) de todas as plantas (SN-40)
    const scope = await this.escopo.getScope(user);
    return this.service.listar({ unidade_id: query.unidade_id, ...(this.escopo.isScoped(scope) && { plantas: scope }) });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar posicao',
    description: 'Traz o equipamento ativo e os anteriores separados — a tela trata os dois de forma diferente.',
  })
  @ApiResponse({ status: 404, description: 'Posicao nao encontrada' })
  async buscarPorId(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    await this.escopo.assertEntityInScope('ativo_funcional', id, user);
    return this.service.buscarPorId(id);
  }

  @Get(":id/plano-a-herdar")
  @ApiOperation({
    summary: "O plano que o ocupante anterior tinha",
    description:
      "Devolve o TEMPLATE e as datas de cada tarefa. As datas vem junto porque sao " +
      "o que precisa de ajuste: uma preventiva semestral feita ha 3 meses no " +
      "equipamento antigo pode ter sido feita ha 5 no novo.",
  })
  @ApiResponse({ status: 200, description: "Nulo quando nao houve ocupante anterior ou ele nao tinha plano" })
  async planoAHerdar(@Param("id") id: string, @CurrentUser() user: ScopedUser) {
    await this.escopo.assertEntityInScope('ativo_funcional', id, user);
    return this.service.planoAHerdar(id);
  }

  @Get(':id/historico')
  @ApiOperation({ summary: 'Tudo que ja passou pela posicao, do mais recente para o mais antigo' })
  async historico(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    await this.escopo.assertEntityInScope('ativo_funcional', id, user);
    return this.service.historico(id);
  }

  @Post()
  @Permissions('equipamentos.manage')
  @ApiOperation({ summary: 'Criar posicao' })
  async criar(@Body() dto: CriarAtivoFuncionalDto) {
    return this.service.criar(dto);
  }

  @Post(':id/instalar')
  @Permissions('equipamentos.manage')
  @ApiOperation({ summary: 'Instalar um equipamento na posicao' })
  @ApiResponse({ status: 409, description: 'A posicao ja tem equipamento ativo' })
  async instalar(
    @Param('id') id: string,
    @Body() dto: InstalarEquipamentoDto,
    @Req() req: Request,
  ) {
    return this.service.instalar(id, dto.equipamento_id, {
      usuarioId: this.usuarioDe(req),
    });
  }

  @Post(':id/remover')
  @Permissions('equipamentos.manage')
  @ApiOperation({ summary: 'Remover o equipamento ativo, liberando a posicao' })
  @ApiResponse({ status: 404, description: 'A posicao nao tem equipamento ativo' })
  async remover(
    @Param('id') id: string,
    @Body() dto: RemoverEquipamentoDto,
    @Req() req: Request,
  ) {
    return this.service.remover(id, { motivo: dto.motivo, usuarioId: this.usuarioDe(req) });
  }

  @Post('equipamentos/:equipamentoId/transferir')
  @Permissions('equipamentos.manage')
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
    @Req() req: Request,
  ) {
    return this.service.transferir(equipamentoId, dto.ativo_funcional_id, {
      motivo: dto.motivo,
      usuarioId: this.usuarioDe(req),
    });
  }
}

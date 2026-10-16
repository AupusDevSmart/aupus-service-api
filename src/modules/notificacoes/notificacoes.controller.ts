import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/core';
import { NotificacoesService } from './notificacoes.service';
import { ListarNotificacoesDto, SalvarPreferenciasDto } from './notificacoes.dto';

interface UsuarioLogado {
  id: string;
  role?: string | null;
}

/**
 * As notificações de quem está logado (SN-47). Sem @Permissions: todo usuário
 * tem as próprias, e o service filtra tudo pelo id dele.
 * Rotas fixas antes de `:id`.
 */
@ApiTags('Notificações')
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly servico: NotificacoesService) {}

  @Get()
  @ApiOperation({ summary: 'Minhas notificações, das mais novas para as antigas' })
  listar(@Query() filtro: ListarNotificacoesDto, @CurrentUser() usuario: UsuarioLogado) {
    return this.servico.listar(usuario.id, filtro);
  }

  @Get('nao-lidas/contagem')
  @ApiOperation({ summary: 'Quantas não lidas (o número do sininho)' })
  async contagem(@CurrentUser() usuario: UsuarioLogado) {
    return { total: await this.servico.contarNaoLidas(usuario.id) };
  }

  @Get('preferencias')
  @ApiOperation({ summary: 'O que recebo por e-mail, evento a evento' })
  preferencias(@CurrentUser() usuario: UsuarioLogado) {
    return this.servico.preferencias(usuario.id, usuario.role);
  }

  @Put('preferencias')
  @ApiOperation({ summary: 'Escolher o que recebo por e-mail' })
  salvarPreferencias(@Body() dto: SalvarPreferenciasDto, @CurrentUser() usuario: UsuarioLogado) {
    return this.servico.salvarPreferencias(usuario.id, dto.preferencias, usuario.role);
  }

  @Patch('lidas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar todas como lidas' })
  async marcarTodas(@CurrentUser() usuario: UsuarioLogado) {
    return { marcadas: await this.servico.marcarTodasLidas(usuario.id) };
  }

  @Patch(':id/lida')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar uma como lida' })
  async marcarLida(@Param('id') id: string, @CurrentUser() usuario: UsuarioLogado) {
    await this.servico.marcarLida(usuario.id, id);
    return { lida: true };
  }
}

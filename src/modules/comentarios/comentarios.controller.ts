import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permissions, type ScopedUser } from '@/core';
import { ComentariosService } from './comentarios.service';
import { EditarComentarioDto, NovoComentarioDto } from './comentarios.dto';
import { LIMITE_DE_COMENTARIOS, SEM_CONTADOR_DE_EMAIL } from '@/core/modules/auth/limite-de-tentativas';

type UsuarioLogado = ScopedUser & { id: string };

/**
 * Comentários da OS (SN-48). Lê quem vê a OS; escreve quem atua nela
 * (executar ou gerenciar) — o cliente lê, mas não comenta na OS.
 */
@ApiTags('Comentários')
@Controller('execucao-os')
@Permissions('execucao_os.view')
export class ComentariosDaOSController {
  constructor(private readonly comentarios: ComentariosService) {}

  @Get(':id/comentarios')
  @ApiOperation({ summary: 'Comentários da OS, do mais antigo ao mais novo' })
  listar(@Param('id') id: string, @CurrentUser() usuario: UsuarioLogado) {
    return this.comentarios.listar('ordem_servico', id, usuario);
  }

  @Post(':id/comentarios')
  @UseGuards(ThrottlerGuard)
  @Throttle(LIMITE_DE_COMENTARIOS)
  @SkipThrottle(SEM_CONTADOR_DE_EMAIL)
  @Permissions('execucao_os.executar', 'execucao_os.manage')
  @ApiOperation({ summary: 'Comentar na OS' })
  comentar(@Param('id') id: string, @Body() dto: NovoComentarioDto, @CurrentUser() usuario: UsuarioLogado) {
    return this.comentarios.comentar('ordem_servico', id, dto, usuario);
  }

  @Patch(':id/comentarios/:comentarioId')
  @Permissions('execucao_os.executar', 'execucao_os.manage')
  @ApiOperation({ summary: 'Editar o próprio comentário (até 15 minutos)' })
  editar(
    @Param('id') id: string,
    @Param('comentarioId') comentarioId: string,
    @Body() dto: EditarComentarioDto,
    @CurrentUser() usuario: UsuarioLogado,
  ) {
    return this.comentarios.editar('ordem_servico', id, comentarioId, dto, usuario);
  }

  @Delete(':id/comentarios/:comentarioId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('execucao_os.executar', 'execucao_os.manage')
  @ApiOperation({ summary: 'Excluir o próprio comentário (até 15 minutos)' })
  excluir(@Param('id') id: string, @Param('comentarioId') comentarioId: string, @CurrentUser() usuario: UsuarioLogado) {
    return this.comentarios.excluir('ordem_servico', id, comentarioId, usuario);
  }
}

/**
 * Comentários da solicitação (SN-48). Lê quem vê a solicitação; escreve quem
 * a gerencia ou abre solicitações — o cliente comenta nas da planta dele.
 */
@ApiTags('Comentários')
@Controller('solicitacoes-servico')
@Permissions('solicitacoes.view', 'solicitacoes.manage')
export class ComentariosDaSolicitacaoController {
  constructor(private readonly comentarios: ComentariosService) {}

  @Get(':id/comentarios')
  @ApiOperation({ summary: 'Comentários da solicitação, do mais antigo ao mais novo' })
  listar(@Param('id') id: string, @CurrentUser() usuario: UsuarioLogado) {
    return this.comentarios.listar('solicitacao_servico', id, usuario);
  }

  @Post(':id/comentarios')
  @UseGuards(ThrottlerGuard)
  @Throttle(LIMITE_DE_COMENTARIOS)
  @SkipThrottle(SEM_CONTADOR_DE_EMAIL)
  @Permissions('solicitacoes.manage', 'solicitacoes.create')
  @ApiOperation({ summary: 'Comentar na solicitação' })
  comentar(@Param('id') id: string, @Body() dto: NovoComentarioDto, @CurrentUser() usuario: UsuarioLogado) {
    return this.comentarios.comentar('solicitacao_servico', id, dto, usuario);
  }

  @Patch(':id/comentarios/:comentarioId')
  @Permissions('solicitacoes.manage', 'solicitacoes.create')
  @ApiOperation({ summary: 'Editar o próprio comentário (até 15 minutos)' })
  editar(
    @Param('id') id: string,
    @Param('comentarioId') comentarioId: string,
    @Body() dto: EditarComentarioDto,
    @CurrentUser() usuario: UsuarioLogado,
  ) {
    return this.comentarios.editar('solicitacao_servico', id, comentarioId, dto, usuario);
  }

  @Delete(':id/comentarios/:comentarioId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('solicitacoes.manage', 'solicitacoes.create')
  @ApiOperation({ summary: 'Excluir o próprio comentário (até 15 minutos)' })
  excluir(@Param('id') id: string, @Param('comentarioId') comentarioId: string, @CurrentUser() usuario: UsuarioLogado) {
    return this.comentarios.excluir('solicitacao_servico', id, comentarioId, usuario);
  }
}

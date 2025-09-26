// src/modules/tarefas/tarefas.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  Res,
  Headers
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import * as path from 'path';
import { TarefasService } from './tarefas.service';
import { AnexosTarefasService } from './anexos-tarefas.service';
import {
  CreateTarefaDto,
  UpdateTarefaDto,
  QueryTarefasDto,
  ReordenarTarefaDto,
  UpdateStatusTarefaDto,
  TarefaResponseDto,
  DashboardTarefasDto,
  AnexoTarefaDetalhesDto
} from './dto';

@ApiTags('Tarefas')
@Controller('tarefas')
// @UseGuards(JwtAuthGuard) // Descomente quando tiver autenticação
export class TarefasController {
  constructor(
    private readonly tarefasService: TarefasService,
    private readonly anexosTarefasService: AnexosTarefasService
  ) {}

  // CRUD Básico de Tarefas

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar nova tarefa em um plano' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Tarefa criada com sucesso',
    type: TarefaResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano de manutenção não encontrado' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'TAG ou ordem já existe' 
  })
  async criar(
    @Body() createDto: CreateTarefaDto
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.criar(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tarefas com filtros e paginação' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de tarefas encontrada',
    schema: {
      type: 'object',
      properties: {
        data: { 
          type: 'array', 
          items: { $ref: '#/components/schemas/TarefaResponseDto' } 
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' }
      }
    }
  })
  async listar(@Query() queryDto: QueryTarefasDto) {
    return this.tarefasService.listar(queryDto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Obter estatísticas gerais das tarefas' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Dashboard obtido com sucesso',
    type: DashboardTarefasDto 
  })
  async obterDashboard(): Promise<DashboardTarefasDto> {
    return this.tarefasService.obterDashboard();
  }

  @Get('plano/:planoId')
  @ApiOperation({ summary: 'Listar tarefas de um plano específico' })
  @ApiParam({ name: 'planoId', description: 'ID do plano de manutenção' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Tarefas do plano encontradas',
    type: [TarefaResponseDto] 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano não encontrado' 
  })
  async listarPorPlano(
    @Param('planoId') planoId: string,
    @Query() queryDto?: Partial<QueryTarefasDto>
  ): Promise<TarefaResponseDto[]> {
    return this.tarefasService.listarPorPlano(planoId, queryDto);
  }

  @Get('equipamento/:equipamentoId')
  @ApiOperation({ summary: 'Listar tarefas de um equipamento específico' })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Tarefas do equipamento encontradas',
    type: [TarefaResponseDto] 
  })
  async listarPorEquipamento(
    @Param('equipamentoId') equipamentoId: string,
    @Query() queryDto?: Partial<QueryTarefasDto>
  ): Promise<TarefaResponseDto[]> {
    return this.tarefasService.listarPorEquipamento(equipamentoId, queryDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar tarefa específica por ID com detalhes completos' })
  @ApiParam({ name: 'id', description: 'ID da tarefa' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Tarefa encontrada',
    type: TarefaResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Tarefa não encontrada' 
  })
  async buscarPorId(
    @Param('id') id: string
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.buscarPorId(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar tarefa com sub-tarefas e recursos' })
  @ApiParam({ name: 'id', description: 'ID da tarefa' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Tarefa atualizada com sucesso',
    type: TarefaResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Tarefa não encontrada' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'TAG ou ordem já existe' 
  })
  async atualizar(
    @Param('id') id: string,
    @Body() updateDto: UpdateTarefaDto
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.atualizar(id, updateDto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Atualizar apenas status da tarefa' })
  @ApiParam({ name: 'id', description: 'ID da tarefa' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Status atualizado com sucesso',
    type: TarefaResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Tarefa não encontrada' 
  })
  async atualizarStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusTarefaDto
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.atualizarStatus(id, updateStatusDto);
  }

  @Put(':id/reordenar')
  @ApiOperation({ summary: 'Alterar ordem da tarefa no plano' })
  @ApiParam({ name: 'id', description: 'ID da tarefa' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Ordem alterada com sucesso',
    type: TarefaResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Tarefa não encontrada' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Ordem já está sendo utilizada' 
  })
  async reordenar(
    @Param('id') id: string,
    @Body() reordenarDto: ReordenarTarefaDto
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.reordenar(id, reordenarDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover tarefa (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID da tarefa' })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Tarefa removida com sucesso' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Tarefa não encontrada' 
  })
  async remover(
    @Param('id') id: string
  ): Promise<void> {
    return this.tarefasService.remover(id);
  }

  // Rotas de Anexos

  @Get(':tarefaId/anexos')
  @ApiOperation({ summary: 'Listar anexos de uma tarefa' })
  @ApiParam({ name: 'tarefaId', description: 'ID da tarefa' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de anexos encontrada',
    type: [AnexoTarefaDetalhesDto] 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Tarefa não encontrada' 
  })
  async listarAnexos(
    @Param('tarefaId') tarefaId: string
  ): Promise<AnexoTarefaDetalhesDto[]> {
    return this.anexosTarefasService.listarAnexosTarefa(tarefaId);
  }

  @Post(':tarefaId/anexos/upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de anexo para tarefa' })
  @ApiParam({ name: 'tarefaId', description: 'ID da tarefa' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Anexo enviado com sucesso',
    type: AnexoTarefaDetalhesDto 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Arquivo inválido ou muito grande' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Tarefa não encontrada' 
  })
  async uploadAnexo(
    @Param('tarefaId') tarefaId: string,
    @UploadedFile() file: any,
    @Body('descricao') descricao?: string,
    @Body('usuario_id') usuarioId?: string
  ): Promise<AnexoTarefaDetalhesDto> {
    return this.anexosTarefasService.uploadAnexo(tarefaId, file, descricao, usuarioId);
  }

  @Get(':tarefaId/anexos/:anexoId/download')
  @ApiOperation({ summary: 'Download de anexo' })
  @ApiParam({ name: 'tarefaId', description: 'ID da tarefa' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Arquivo encontrado' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Anexo ou arquivo não encontrado' 
  })
  async downloadAnexo(
    @Param('tarefaId') tarefaId: string,
    @Param('anexoId') anexoId: string,
    @Res() res: Response
  ): Promise<void> {
    const anexo = await this.anexosTarefasService.buscarAnexo(anexoId);
    const caminhoArquivo = await this.anexosTarefasService.obterCaminhoArquivo(anexoId);

    // Configurar headers para download
    res.setHeader('Content-Type', anexo.content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${anexo.nome}"`);
    
    if (anexo.tamanho) {
      res.setHeader('Content-Length', anexo.tamanho);
    }

    // Enviar arquivo
    res.sendFile(path.resolve(caminhoArquivo));
  }

  @Delete(':tarefaId/anexos/:anexoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover anexo da tarefa' })
  @ApiParam({ name: 'tarefaId', description: 'ID da tarefa' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Anexo removido com sucesso' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Anexo não encontrado' 
  })
  async removerAnexo(
    @Param('tarefaId') tarefaId: string,
    @Param('anexoId') anexoId: string
  ): Promise<void> {
    return this.anexosTarefasService.removerAnexo(anexoId);
  }
}
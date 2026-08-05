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
import { Permissions, CurrentUser } from '@aupus/api-shared';
import { Response } from 'express';
import * as path from 'path';
import { TarefasService } from './tarefas.service';
import { TarefasSchedulerService } from './tarefas-scheduler.service';
import {
  CreateTarefaDto,
  UpdateTarefaDto,
  QueryTarefasDto,
  ReordenarTarefaDto,
  TarefaResponseDto
} from './dto';

@ApiTags('Tarefas')
@Controller('tarefas')
@Permissions('manutencao.manage')
export class TarefasController {
  constructor(
    private readonly tarefasService: TarefasService,
    private readonly tarefasSchedulerService: TarefasSchedulerService
  ) {}

  // Geração automática de programações

  @Post('gerar-programacoes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gerar programações OS automaticamente a partir de tarefas próximas do prazo' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Resultado da geração automática',
  })
  async gerarProgramacoes() {
    return this.tarefasSchedulerService.gerarProgramacoesAutomaticas();
  }

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
  async listar(@Query() queryDto: QueryTarefasDto, @CurrentUser() user: any) {
    return this.tarefasService.listar(queryDto, user);
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
    @CurrentUser() user: any,
    @Query() queryDto?: Partial<QueryTarefasDto>
  ): Promise<TarefaResponseDto[]> {
    return this.tarefasService.listarPorPlano(planoId, queryDto, user);
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
    @CurrentUser() user: any,
    @Query() queryDto?: Partial<QueryTarefasDto>
  ): Promise<TarefaResponseDto[]> {
    return this.tarefasService.listarPorEquipamento(equipamentoId, queryDto, user);
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
    @Param('id') id: string,
    @CurrentUser() user: any
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.buscarPorId(id, user);
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
    @Body() updateDto: UpdateTarefaDto,
    @CurrentUser() user: any
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.atualizar(id, updateDto, user);
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
    @Body() reordenarDto: ReordenarTarefaDto,
    @CurrentUser() user: any
  ): Promise<TarefaResponseDto> {
    return this.tarefasService.reordenar(id, reordenarDto, user);
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
    @Param('id') id: string,
    @CurrentUser() user: any
  ): Promise<void> {
    return this.tarefasService.remover(id, user);
  }

  // Rotas de Anexos

}

// src/modules/planos-manutencao/planos-manutencao.controller.ts
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
  ParseUUIDPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Permissions, CurrentUser } from '@aupus/api-shared';
import { PlanosManutencaoService } from './planos-manutencao.service';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  VincularPlanoDto,
  VincularPlanoResponseDto,
  PreviaDesvinculoDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto
} from './dto';

@ApiTags('Planos de Manutenção')
@Controller('planos-manutencao')
@Permissions('manutencao.manage')
export class PlanosManutencaoController {
  constructor(
    private readonly planosManutencaoService: PlanosManutencaoService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar novo plano de manutenção' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Plano criado com sucesso',
    type: PlanoManutencaoResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Equipamento já possui plano de manutenção' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Equipamento não encontrado' 
  })
  async criar(
    @Body() createDto: CreatePlanoManutencaoDto,
    @CurrentUser() user?: any,
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.criar(createDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar planos de manutenção com filtros e paginação' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de planos encontrada',
    schema: {
      type: 'object',
      properties: {
        data: { 
          type: 'array', 
          items: { $ref: '#/components/schemas/PlanoManutencaoResponseDto' } 
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' }
      }
    }
  })
  async listar(@Query() queryDto: QueryPlanosDto, @CurrentUser() user?: any) {
    return this.planosManutencaoService.listar(queryDto, user);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Obter estatísticas gerais dos planos' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dashboard obtido com sucesso',
    type: DashboardPlanosDto
  })
  async obterDashboard(): Promise<DashboardPlanosDto> {
    return this.planosManutencaoService.obterDashboard();
  }

  @Get('por-planta/:plantaId')
  @ApiOperation({ summary: 'Buscar planos de manutenção por planta' })
  @ApiParam({ name: 'plantaId', description: 'ID da planta' })
  @ApiQuery({
    name: 'incluir_tarefas',
    required: false,
    type: 'boolean',
    description: 'Incluir tarefas dos planos na resposta'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'number',
    description: 'Número da página (default: 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Items por página (default: 10, max: 100)'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Planos encontrados',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/PlanoManutencaoResponseDto' }
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Planta não encontrada'
  })
  async buscarPorPlanta(
    @Param('plantaId') plantaId: string,
    @Query() queryDto: QueryPlanosPorPlantaDto,
    @CurrentUser() user?: any,
  ) {
    return this.planosManutencaoService.buscarPorPlanta(plantaId, queryDto, user);
  }

  @Get('por-unidade/:unidadeId')
  @ApiOperation({ summary: 'Buscar planos de manutenção por unidade' })
  @ApiParam({ name: 'unidadeId', description: 'ID da unidade' })
  @ApiQuery({
    name: 'incluir_tarefas',
    required: false,
    type: 'boolean',
    description: 'Incluir tarefas dos planos na resposta'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'number',
    description: 'Número da página (default: 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Items por página (default: 10, max: 100)'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Planos encontrados',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/PlanoManutencaoResponseDto' }
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada'
  })
  async buscarPorUnidade(
    @Param('unidadeId') unidadeId: string,
    @Query() queryDto: QueryPlanosPorPlantaDto,
    @CurrentUser() user?: any,
  ) {
    return this.planosManutencaoService.buscarPorUnidade(unidadeId, queryDto, user);
  }

  @Get('por-equipamento/:equipamentoId')
  @ApiOperation({ summary: 'Buscar plano por equipamento' })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Plano encontrado',
    type: PlanoManutencaoResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Equipamento não possui plano de manutenção' 
  })
  async buscarPorEquipamento(
    @Param('equipamentoId') equipamentoId: string,
    @CurrentUser() user?: any,
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.buscarPorEquipamento(equipamentoId, user);
  }

  // ==========================================
  // Vinculo equipamento <-> plano
  // ==========================================

  @Get('equipamento/:equipamentoId/templates')
  @ApiOperation({
    summary: 'Listar planos template aplicaveis ao equipamento (mesma categoria do modelo)'
  })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({ status: HttpStatus.OK, type: [PlanoManutencaoResponseDto] })
  async listarTemplatesDoEquipamento(
    @Param('equipamentoId') equipamentoId: string,
    @CurrentUser() user?: any,
  ): Promise<PlanoManutencaoResponseDto[]> {
    return this.planosManutencaoService.listarTemplatesDoEquipamento(equipamentoId, user);
  }

  @Get('equipamento/:equipamentoId/previa-desvinculo')
  @ApiOperation({
    summary: 'O que se perde ao trocar ou desvincular o plano do equipamento'
  })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({ status: HttpStatus.OK, type: PreviaDesvinculoDto })
  async previaDesvinculo(
    @Param('equipamentoId') equipamentoId: string,
    @CurrentUser() user?: any,
  ): Promise<PreviaDesvinculoDto> {
    return this.planosManutencaoService.previaDesvinculo(equipamentoId, user);
  }

  @Post('vincular')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Vincular um plano template a um equipamento, copiando plano e tarefas'
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: VincularPlanoResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Equipamento nao e UC, esta sem modelo, ou o plano e de outra categoria'
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Equipamento ou plano nao encontrado' })
  async vincularEquipamento(
    @Body() dto: VincularPlanoDto,
    @CurrentUser() user?: any,
  ): Promise<VincularPlanoResponseDto> {
    return this.planosManutencaoService.vincularEquipamento(
      { ...dto, criado_por: dto.criado_por || user?.id },
      user,
    );
  }

  @Delete('equipamento/:equipamentoId/vinculo')
  @ApiOperation({ summary: 'Desvincular o plano do equipamento, removendo a copia' })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({ status: HttpStatus.OK, type: PreviaDesvinculoDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Equipamento sem plano vinculado' })
  async desvincularEquipamento(
    @Param('equipamentoId') equipamentoId: string,
    @CurrentUser() user?: any,
  ): Promise<PreviaDesvinculoDto> {
    return this.planosManutencaoService.desvincularEquipamento(equipamentoId, user);
  }

  @Get(':id/propagacao')
  @ApiOperation({
    summary: 'Andamento das propagacoes do template para as copias (10 mais recentes)'
  })
  @ApiParam({ name: 'id', description: 'ID do plano template' })
  async consultarPropagacoes(@Param('id') id: string) {
    return this.planosManutencaoService.consultarPropagacoes(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar plano específico por ID' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiQuery({ 
    name: 'incluirTarefas', 
    required: false, 
    type: 'boolean',
    description: 'Incluir tarefas do plano na resposta' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Plano encontrado',
    type: PlanoManutencaoResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano não encontrado' 
  })
  async buscarPorId(
    @Param('id') id: string,
    @CurrentUser() user?: any,
    @Query('incluirTarefas') incluirTarefas?: string,
  ): Promise<PlanoManutencaoResponseDto> {
    const incluir = incluirTarefas === 'true';
    return this.planosManutencaoService.buscarPorId(id, incluir, user);
  }

  @Get(':id/resumo')
  @ApiOperation({ summary: 'Obter resumo estatístico do plano' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Resumo obtido com sucesso',
    type: PlanoResumoDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano não encontrado' 
  })
  async obterResumo(
    @Param('id') id: string
  ): Promise<PlanoResumoDto> {
    return this.planosManutencaoService.obterResumo(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar plano de manutenção' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Plano atualizado com sucesso',
    type: PlanoManutencaoResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano não encontrado' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Novo equipamento já possui plano' 
  })
  async atualizar(
    @Param('id') id: string,
    @Body() updateDto: UpdatePlanoManutencaoDto,
    @CurrentUser() user?: any,
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.atualizar(id, updateDto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover plano de manutenção (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Plano removido com sucesso' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano não encontrado' 
  })
  async remover(
    @Param('id') id: string,
    @CurrentUser() user?: any,
  ): Promise<void> {
    return this.planosManutencaoService.remover(id, user);
  }
}
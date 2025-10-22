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
import { PlanosManutencaoService } from './planos-manutencao.service';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  DuplicarPlanoDto,
  UpdateStatusPlanoDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto
} from './dto';

@ApiTags('Planos de Manutenção')
@Controller('planos-manutencao')
// @UseGuards(JwtAuthGuard) // Descomente quando tiver autenticação
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
    @Body() createDto: CreatePlanoManutencaoDto
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.criar(createDto);
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
  async listar(@Query() queryDto: QueryPlanosDto) {
    return this.planosManutencaoService.listar(queryDto);
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
    name: 'status',
    required: false,
    enum: ['ATIVO', 'INATIVO', 'EM_REVISAO', 'ARQUIVADO'],
    description: 'Filtrar por status (default: ATIVO)'
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
    @Query() queryDto: QueryPlanosPorPlantaDto
  ) {
    return this.planosManutencaoService.buscarPorPlanta(plantaId, queryDto);
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
    name: 'status',
    required: false,
    enum: ['ATIVO', 'INATIVO', 'EM_REVISAO', 'ARQUIVADO'],
    description: 'Filtrar por status (default: ATIVO)'
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
    @Query() queryDto: QueryPlanosPorPlantaDto
  ) {
    return this.planosManutencaoService.buscarPorUnidade(unidadeId, queryDto);
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
    @Param('equipamentoId') equipamentoId: string
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.buscarPorEquipamento(equipamentoId);
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
    @Query('incluirTarefas') incluirTarefas?: string
  ): Promise<PlanoManutencaoResponseDto> {
    const incluir = incluirTarefas === 'true';
    return this.planosManutencaoService.buscarPorId(id, incluir);
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
    @Body() updateDto: UpdatePlanoManutencaoDto
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.atualizar(id, updateDto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Atualizar apenas status do plano' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Status atualizado com sucesso',
    type: PlanoManutencaoResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano não encontrado' 
  })
  async atualizarStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusPlanoDto
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.atualizarStatus(id, updateStatusDto);
  }

  @Post(':id/duplicar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Duplicar plano completo para outro equipamento' })
  @ApiParam({ name: 'id', description: 'ID do plano a ser duplicado' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Plano duplicado com sucesso',
    type: PlanoManutencaoResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Plano original não encontrado' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'Equipamento destino já possui plano' 
  })
  async duplicar(
    @Param('id') id: string,
    @Body() duplicarDto: DuplicarPlanoDto
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.duplicar(id, duplicarDto);
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
    @Param('id') id: string
  ): Promise<void> {
    return this.planosManutencaoService.remover(id);
  }
}
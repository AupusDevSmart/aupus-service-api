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
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Permissions, CurrentUser, ScopedUser } from '@/core';
import { PlanosManutencaoService } from './planos-manutencao.service';
import { PrimeirosVencimentosDto, PrimeirosVencimentosQueryDto } from './dto/primeiros-vencimentos.dto';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  VincularPlanoDto,
  VincularPlanoResponseDto,
  HerdarPlanoDto,
  HerdarPlanoResponseDto,
  PreviaDesvinculoDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto
} from './dto';

@ApiTags('Planos de Manutenção')
@Controller('planos-manutencao')
// Ler: quem executa e o cliente também leem. Escrever: cada escrita pede manutencao.manage.
@Permissions('manutencao.view', 'manutencao.manage')
export class PlanosManutencaoController {
  constructor(
    private readonly planosManutencaoService: PlanosManutencaoService
  ) {}

  @Post()
  @Permissions('manutencao.manage')
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
    @CurrentUser() user?: ScopedUser,
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
  async listar(@Query() queryDto: QueryPlanosDto, @CurrentUser() user?: ScopedUser) {
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
    @CurrentUser() user?: ScopedUser,
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
    @CurrentUser() user?: ScopedUser,
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
    @CurrentUser() user?: ScopedUser,
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
    @CurrentUser() user?: ScopedUser,
  ): Promise<PlanoManutencaoResponseDto[]> {
    return this.planosManutencaoService.listarTemplatesDoEquipamento(equipamentoId, user);
  }

  @Get('categoria/:categoriaId/templates')
  @ApiOperation({
    summary: 'Listar planos template de uma categoria',
    description:
      'Usado no cadastro de equipamento, quando ainda nao ha id para consultar por equipamento.',
  })
  @ApiParam({ name: 'categoriaId', description: 'ID da categoria de equipamento' })
  @ApiResponse({ status: HttpStatus.OK, type: [PlanoManutencaoResponseDto] })
  async listarTemplatesDaCategoria(
    @Param('categoriaId') categoriaId: string,
  ): Promise<PlanoManutencaoResponseDto[]> {
    return this.planosManutencaoService.listarTemplatesDaCategoria(categoriaId);
  }

  @Get('equipamento/:equipamentoId/previa-desvinculo')
  @ApiOperation({
    summary: 'O que se perde ao trocar ou desvincular o plano do equipamento'
  })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({ status: HttpStatus.OK, type: PreviaDesvinculoDto })
  async previaDesvinculo(
    @Param('equipamentoId') equipamentoId: string,
    @CurrentUser() user?: ScopedUser,
  ): Promise<PreviaDesvinculoDto> {
    return this.planosManutencaoService.previaDesvinculo(equipamentoId, user);
  }

  @Post('vincular')
  @Permissions('manutencao.manage')
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
    @CurrentUser() user?: ScopedUser,
  ): Promise<VincularPlanoResponseDto> {
    // O autor é quem está logado: o do corpo deixava gravar a cópia em nome de outro
    return this.planosManutencaoService.vincularEquipamento(
      { ...dto, criado_por: user?.id },
      user,
    );
  }

  @Get(':id/primeiros-vencimentos')
  @Permissions('manutencao.manage')
  @ApiOperation({
    summary: 'O primeiro vencimento de cada tarefa se o plano for vinculado a partir da data dada',
    description:
      'Pela mesma conta do gerador de preventivas. Com equipamento_id, as checagens do vínculo e os dias úteis da planta; ' +
      'sem ele (no cadastro do equipamento), só o vencimento.',
  })
  @ApiParam({ name: 'id', description: 'ID do plano template' })
  @ApiResponse({ status: HttpStatus.OK, type: PrimeirosVencimentosDto })
  async primeirosVencimentos(
    @Param('id') id: string,
    @Query() dto: PrimeirosVencimentosQueryDto,
    @CurrentUser() user?: ScopedUser,
  ): Promise<PrimeirosVencimentosDto> {
    return this.planosManutencaoService.primeirosVencimentosDoVinculo(id, dto, user);
  }

  @Post('herdar')
  @Permissions('manutencao.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Herdar para o equipamento novo o plano que o ocupante anterior da posicao tinha',
    description:
      'Copia o TEMPLATE (nao a copia do equipamento antigo) e aplica as datas revisadas. ' +
      'Uma chamada so porque as tarefas da copia nova so existem depois de copiadas: ' +
      'o cliente nao tem como saber os ids para ajustar num segundo passo.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: HerdarPlanoResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'A posicao nao tem ocupante anterior com plano' })
  async herdarPlano(
    @Body() dto: HerdarPlanoDto,
    @CurrentUser() user?: ScopedUser,
  ): Promise<HerdarPlanoResponseDto> {
    return this.planosManutencaoService.herdarPlano(
      { ...dto, criado_por: user?.id },
      user,
    );
  }

  @Delete('equipamento/:equipamentoId/vinculo')
  @Permissions('manutencao.manage')
  @ApiOperation({ summary: 'Desvincular o plano do equipamento, removendo a copia' })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({ status: HttpStatus.OK, type: PreviaDesvinculoDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Equipamento sem plano vinculado' })
  async desvincularEquipamento(
    @Param('equipamentoId') equipamentoId: string,
    @CurrentUser() user?: ScopedUser,
  ): Promise<PreviaDesvinculoDto> {
    return this.planosManutencaoService.desvincularEquipamento(equipamentoId, user);
  }

  @Get(':id/propagacao')
  @ApiOperation({
    summary: 'Andamento das propagacoes do template para as copias (10 mais recentes)'
  })
  @ApiParam({ name: 'id', description: 'ID do plano template' })
  async consultarPropagacoes(@Param('id') id: string, @CurrentUser() user?: ScopedUser) {
    return this.planosManutencaoService.consultarPropagacoes(id, user);
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
    @CurrentUser() user?: ScopedUser,
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
    @Param('id') id: string,
    @CurrentUser() user?: ScopedUser,
  ): Promise<PlanoResumoDto> {
    return this.planosManutencaoService.obterResumo(id, user);
  }

  @Put(':id')
  @Permissions('manutencao.manage')
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
    @CurrentUser() user?: ScopedUser,
  ): Promise<PlanoManutencaoResponseDto> {
    return this.planosManutencaoService.atualizar(id, updateDto, user);
  }

  @Delete(':id')
  @Permissions('manutencao.manage')
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
    @CurrentUser() user?: ScopedUser,
  ): Promise<void> {
    return this.planosManutencaoService.remover(id, user);
  }
}
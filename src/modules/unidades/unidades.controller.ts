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
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UnidadesService } from './unidades.service';
import {
  CreateUnidadeDto,
  UpdateUnidadeDto,
  FindAllUnidadesDto,
  UnidadeResponse,
  PaginatedUnidadesResponse,
} from './dto';
import { EquipamentosService } from '../equipamentos/equipamentos.service';
import { EquipamentoQueryDto } from '../equipamentos/dto/equipamento-query.dto';
import { DiagramasService } from '../diagramas/services/diagramas.service';
import { UserProprietarioId } from '../auth/decorators/user-proprietario.decorator';

@ApiTags('unidades')
@Controller('unidades')
export class UnidadesController {
  private readonly logger = new Logger(UnidadesController.name);

  constructor(
    private readonly unidadesService: UnidadesService,
    private readonly equipamentosService: EquipamentosService,
    private readonly diagramasService: DiagramasService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Criar nova unidade',
    description: 'Cadastra uma nova unidade vinculada a uma planta',
  })
  @ApiBody({ type: CreateUnidadeDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Unidade criada com sucesso',
    type: UnidadeResponse,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dados inválidos ou erro de validação',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Planta não encontrada',
  })
  async create(@Body() createDto: CreateUnidadeDto): Promise<UnidadeResponse> {
    this.logger.log(`🏗️  [CREATE UNIDADE] Iniciando criação de unidade`);
    this.logger.log(`📝 [CREATE UNIDADE] Dados:`, JSON.stringify(createDto, null, 2));
    this.logger.log(`🔑 [CREATE UNIDADE - CONTROLLER] concessionaria_id recebido:`, createDto.concessionaria_id);
    this.logger.log(`🔍 [CREATE UNIDADE - CONTROLLER] Tipo:`, typeof createDto.concessionaria_id);

    try {
      const unidade = await this.unidadesService.create(createDto);
      this.logger.log(`✅ [CREATE UNIDADE] Unidade criada - ID: ${unidade.id}`);
      this.logger.log(`🔑 [CREATE UNIDADE - CONTROLLER] concessionaria_id na resposta:`, unidade.concessionariaId);
      return unidade;
    } catch (error) {
      this.logger.error(`❌ [CREATE UNIDADE] Erro:`, error.message);
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Listar unidades',
    description: 'Retorna lista paginada de unidades com filtros opcionais. Usuários não-admin veem apenas suas unidades.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Busca textual' })
  @ApiQuery({ name: 'plantaId', required: false, type: String, description: 'Filtrar por planta' })
  @ApiQuery({ name: 'proprietarioId', required: false, type: String, description: 'Filtrar por proprietário (admin only)' })
  @ApiQuery({ name: 'tipo', required: false, enum: ['UFV', 'Carga', 'Motor', 'Inversor', 'Transformador'] })
  @ApiQuery({ name: 'status', required: false, enum: ['ativo', 'inativo'] })
  @ApiQuery({ name: 'estado', required: false, type: String })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['nome', 'tipo', 'cidade', 'potencia', 'criadoEm'] })
  @ApiQuery({ name: 'orderDirection', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de unidades retornada com sucesso',
    type: PaginatedUnidadesResponse,
  })
  async findAll(
    @Query(new ValidationPipe({ transform: true })) queryDto: FindAllUnidadesDto,
    @UserProprietarioId() autoProprietarioId: string | null
  ): Promise<PaginatedUnidadesResponse> {
    const effectiveProprietarioId = autoProprietarioId || queryDto.proprietarioId;

    this.logger.log(`📋 [LIST UNIDADES] autoProprietarioId: ${autoProprietarioId}, queryProprietarioId: ${queryDto.proprietarioId}, effective: ${effectiveProprietarioId}`);

    try {
      const result = await this.unidadesService.findAll({
        ...queryDto,
        proprietarioId: effectiveProprietarioId
      });
      this.logger.log(
        `✅ [LIST UNIDADES] Encontradas ${result.data.length} de ${result.pagination.total}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`❌ [LIST UNIDADES] Erro:`, error.message);
      throw error;
    }
  }

  @Get('planta/:plantaId')
  @ApiOperation({
    summary: 'Listar unidades de uma planta',
    description: 'Retorna todas as unidades vinculadas a uma planta específica',
  })
  @ApiParam({
    name: 'plantaId',
    description: 'ID da planta',
    example: 'plt_01234567890123456789012345',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de unidades da planta',
    type: [UnidadeResponse],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Planta não encontrada',
  })
  async findByPlanta(@Param('plantaId') plantaId: string): Promise<UnidadeResponse[]> {
    this.logger.log(`📋 [LIST UNIDADES BY PLANTA] Planta: ${plantaId}`);

    try {
      const unidades = await this.unidadesService.findByPlanta(plantaId);
      this.logger.log(`✅ [LIST UNIDADES BY PLANTA] Encontradas ${unidades.length} unidades`);
      return unidades;
    } catch (error) {
      this.logger.error(`❌ [LIST UNIDADES BY PLANTA] Erro:`, error.message);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar unidade por ID',
    description: 'Retorna os detalhes de uma unidade específica',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da unidade',
    example: 'uni_01234567890123456789012345',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unidade encontrada com sucesso',
    type: UnidadeResponse,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada',
  })
  async findOne(@Param('id') id: string): Promise<UnidadeResponse> {
    this.logger.log(`🔍 [GET UNIDADE] Buscando unidade: ${id}`);

    try {
      const unidade = await this.unidadesService.findOne(id);
      this.logger.log(`✅ [GET UNIDADE] Unidade encontrada: ${unidade.nome}`);
      return unidade;
    } catch (error) {
      this.logger.error(`❌ [GET UNIDADE] Erro:`, error.message);
      throw error;
    }
  }

  @Get(':id/estatisticas')
  @ApiOperation({
    summary: 'Estatísticas da unidade',
    description: 'Retorna estatísticas dos equipamentos da unidade',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da unidade',
    example: 'uni_01234567890123456789012345',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Estatísticas retornadas com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada',
  })
  async getEstatisticas(@Param('id') id: string) {
    this.logger.log(`📊 [ESTATISTICAS UNIDADE] Unidade: ${id}`);

    try {
      const stats = await this.unidadesService.getEstatisticas(id);
      this.logger.log(`✅ [ESTATISTICAS UNIDADE] Estatísticas geradas`);
      return stats;
    } catch (error) {
      this.logger.error(`❌ [ESTATISTICAS UNIDADE] Erro:`, error.message);
      throw error;
    }
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualizar unidade',
    description: 'Atualiza os dados de uma unidade existente',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da unidade',
    example: 'uni_01234567890123456789012345',
  })
  @ApiBody({ type: UpdateUnidadeDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unidade atualizada com sucesso',
    type: UnidadeResponse,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dados inválidos',
  })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateUnidadeDto,
  ): Promise<UnidadeResponse> {
    this.logger.log(`🔄 [UPDATE UNIDADE] Atualizando: ${id}`);
    this.logger.log(`📝 [UPDATE UNIDADE] Dados:`, JSON.stringify(updateDto, null, 2));
    this.logger.log(`🔑 [UPDATE UNIDADE - CONTROLLER] concessionaria_id recebido:`, updateDto.concessionaria_id);
    this.logger.log(`🔍 [UPDATE UNIDADE - CONTROLLER] Tipo:`, typeof updateDto.concessionaria_id);

    try {
      const unidade = await this.unidadesService.update(id, updateDto);
      this.logger.log(`✅ [UPDATE UNIDADE] Unidade atualizada: ${unidade.nome}`);
      this.logger.log(`🔑 [UPDATE UNIDADE - CONTROLLER] concessionaria_id na resposta:`, unidade.concessionariaId);
      return unidade;
    } catch (error) {
      this.logger.error(`❌ [UPDATE UNIDADE] Erro:`, error.message);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover unidade',
    description: 'Remove uma unidade (soft delete). Não permite remoção se houver equipamentos vinculados.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da unidade',
    example: 'uni_01234567890123456789012345',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unidade removida com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Não é possível remover unidade com equipamentos vinculados',
  })
  async remove(@Param('id') id: string) {
    this.logger.log(`🗑️  [DELETE UNIDADE] Removendo: ${id}`);

    try {
      const result = await this.unidadesService.remove(id);
      this.logger.log(`✅ [DELETE UNIDADE] ${result.message}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ [DELETE UNIDADE] Erro:`, error.message);
      throw error;
    }
  }

  @Get(':id/equipamentos')
  @ApiOperation({
    summary: 'Listar equipamentos de uma unidade',
    description: 'Retorna todos os equipamentos vinculados a uma unidade específica com filtros opcionais',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da unidade',
    example: 'uni_01234567890123456789012345',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Busca por nome/tag' })
  @ApiQuery({ name: 'classificacao', required: false, enum: ['UC', 'UAR'] })
  @ApiQuery({ name: 'criticidade', required: false, enum: ['1', '2', '3', '4', '5'] })
  @ApiQuery({ name: 'semDiagrama', required: false, type: Boolean, description: 'Apenas equipamentos não posicionados em diagramas' })
  @ApiQuery({ name: 'tipo', required: false, type: String, description: 'Filtrar por tipo de equipamento' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de equipamentos da unidade com informações completas de tipo',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada',
  })
  async findEquipamentosByUnidade(
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true })) query: EquipamentoQueryDto,
  ) {
    this.logger.log(`📋 [LIST EQUIPAMENTOS BY UNIDADE] Unidade: ${id}`);
    this.logger.log(`📝 [LIST EQUIPAMENTOS BY UNIDADE] Filtros:`, JSON.stringify(query, null, 2));

    try {
      const result = await this.equipamentosService.findByUnidade(id, query);
      this.logger.log(
        `✅ [LIST EQUIPAMENTOS BY UNIDADE] Encontrados ${result.data.length} de ${result.pagination.total} equipamentos`,
      );
      return result;
    } catch (error) {
      this.logger.error(`❌ [LIST EQUIPAMENTOS BY UNIDADE] Erro:`, error.message);
      throw error;
    }
  }

  @Get(':id/equipamentos/estatisticas')
  @ApiOperation({
    summary: 'Estatísticas dos equipamentos de uma unidade',
    description: 'Retorna estatísticas agregadas dos equipamentos da unidade',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da unidade',
    example: 'uni_01234567890123456789012345',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Estatísticas dos equipamentos',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada',
  })
  async getEstatisticasEquipamentos(@Param('id') id: string) {
    this.logger.log(`📊 [ESTATISTICAS EQUIPAMENTOS UNIDADE] Unidade: ${id}`);

    try {
      const stats = await this.equipamentosService.getEstatisticasUnidade(id);
      this.logger.log(`✅ [ESTATISTICAS EQUIPAMENTOS UNIDADE] Estatísticas geradas`);
      return stats;
    } catch (error) {
      this.logger.error(`❌ [ESTATISTICAS EQUIPAMENTOS UNIDADE] Erro:`, error.message);
      throw error;
    }
  }

  @Get(':id/diagramas')
  @ApiOperation({
    summary: 'Listar diagramas de uma unidade',
    description: 'Retorna todos os diagramas vinculados a uma unidade específica. Usuários não-admin só veem diagramas de suas unidades.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da unidade',
    example: 'uni_01234567890123456789012345',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de diagramas da unidade',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada ou sem permissão',
  })
  async findDiagramasByUnidade(
    @Param('id') id: string,
    @UserProprietarioId() autoProprietarioId: string | null
  ) {
    this.logger.log(`📋 [LIST DIAGRAMAS BY UNIDADE] Unidade: ${id}, autoProprietarioId: ${autoProprietarioId}`);

    try {
      const diagramas = await this.diagramasService.findByUnidade(id, autoProprietarioId);
      this.logger.log(`✅ [LIST DIAGRAMAS BY UNIDADE] Encontrados ${diagramas.length} diagramas`);
      return {
        success: true,
        data: diagramas,
      };
    } catch (error) {
      this.logger.error(`❌ [LIST DIAGRAMAS BY UNIDADE] Erro:`, error.message);
      throw error;
    }
  }
}

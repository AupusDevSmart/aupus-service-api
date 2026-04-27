import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpStatus,
  Logger,
  ValidationPipe
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { Permissions } from '@aupus/api-shared';
import { AgendaService, DiaUtilResponse, ProximosDiasUteisResponse } from './agenda.service';
import { FeriadosService, PaginatedResponse } from './feriados.service';
import { ConfiguracoesDiasUteisService } from './configuracoes-dias-uteis.service';
import {
  CreateFeriadoDto,
  UpdateFeriadoDto,
  QueryFeriadosDto,
  FeriadoResponseDto,
  CreateConfiguracaoDiasUteisDto,
  UpdateConfiguracaoDiasUteisDto,
  QueryConfiguracoesDto,
  ConfiguracaoDiasUteisResponseDto,
  VerificarDiaUtilDto,
  ProximosDiasUteisDto,
  AssociarPlantasDto
} from './dto';

@ApiTags('agenda')
@Controller('agenda')
@Permissions('agenda.manage')
export class AgendaController {
  private readonly logger = new Logger(AgendaController.name);

  constructor(
    private readonly agendaService: AgendaService,
    private readonly feriadosService: FeriadosService,
    private readonly configuracoesService: ConfiguracoesDiasUteisService
  ) {}

  // ==================== FERIADOS ====================

  @Post('feriados')
  @ApiOperation({
    summary: 'Criar novo feriado',
    description: 'Cadastra um novo feriado no sistema que pode ser geral ou específico para plantas'
  })
  @ApiBody({ type: CreateFeriadoDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Feriado criado com sucesso',
    type: FeriadoResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dados inválidos ou plantas não encontradas'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Já existe feriado na data especificada'
  })
  async criarFeriado(@Body() createDto: CreateFeriadoDto): Promise<FeriadoResponseDto> {
    this.logger.log(`📅 [CREATE FERIADO] Criando feriado: ${createDto.nome}`);

    try {
      const feriado = await this.feriadosService.criar(createDto);
      this.logger.log(`✅ [CREATE FERIADO] Feriado criado - ID: ${feriado.id}`);
      return feriado;
    } catch (error) {
      this.logger.error(`❌ [CREATE FERIADO] Erro ao criar feriado:`, error.message);
      throw error;
    }
  }

  @Get('feriados')
  @ApiOperation({
    summary: 'Listar feriados',
    description: 'Retorna lista paginada de feriados com filtros opcionais'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página atual', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página', example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Buscar por nome ou descrição' })
  @ApiQuery({ name: 'tipo', required: false, enum: ['NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'PERSONALIZADO'] })
  @ApiQuery({ name: 'plantaId', required: false, type: String, description: 'Filtrar por planta específica' })
  @ApiQuery({ name: 'ano', required: false, type: Number, description: 'Filtrar por ano' })
  @ApiQuery({ name: 'geral', required: false, type: Boolean, description: 'Filtrar feriados gerais' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de feriados retornada com sucesso'
  })
  async listarFeriados(
    @Query(new ValidationPipe({ transform: true })) queryDto: QueryFeriadosDto
  ): Promise<PaginatedResponse<FeriadoResponseDto>> {
    this.logger.log(`📋 [LIST FERIADOS] Buscando feriados com filtros:`, JSON.stringify(queryDto, null, 2));

    try {
      const result = await this.feriadosService.buscarTodos(queryDto);
      this.logger.log(`✅ [LIST FERIADOS] Encontrados ${result.data.length} feriados de ${result.pagination.total} total`);
      return result;
    } catch (error) {
      this.logger.error(`❌ [LIST FERIADOS] Erro ao buscar feriados:`, error.message);
      throw error;
    }
  }

  @Get('feriados/:id')
  @ApiOperation({
    summary: 'Buscar feriado por ID',
    description: 'Retorna os detalhes de um feriado específico'
  })
  @ApiParam({
    name: 'id',
    description: 'ID do feriado',
    example: 'fer_01234567890123456789012345'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feriado encontrado com sucesso',
    type: FeriadoResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Feriado não encontrado'
  })
  async buscarFeriado(@Param('id') id: string): Promise<FeriadoResponseDto> {
    this.logger.log(`🔍 [GET FERIADO] Buscando feriado ID: ${id}`);

    try {
      const feriado = await this.feriadosService.buscarPorId(id);
      this.logger.log(`✅ [GET FERIADO] Feriado encontrado: ${feriado.nome}`);
      return feriado;
    } catch (error) {
      this.logger.error(`❌ [GET FERIADO] Erro ao buscar feriado ${id}:`, error.message);
      throw error;
    }
  }

  @Put('feriados/:id')
  @ApiOperation({
    summary: 'Atualizar feriado',
    description: 'Atualiza os dados de um feriado existente'
  })
  @ApiParam({
    name: 'id',
    description: 'ID do feriado',
    example: 'fer_01234567890123456789012345'
  })
  @ApiBody({ type: UpdateFeriadoDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feriado atualizado com sucesso',
    type: FeriadoResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Feriado não encontrado'
  })
  async atualizarFeriado(
    @Param('id') id: string,
    @Body() updateDto: UpdateFeriadoDto
  ): Promise<FeriadoResponseDto> {
    this.logger.log(`🔄 [UPDATE FERIADO] Atualizando feriado ${id}`);

    try {
      const feriado = await this.feriadosService.atualizar(id, updateDto);
      this.logger.log(`✅ [UPDATE FERIADO] Feriado atualizado: ${feriado.nome}`);
      return feriado;
    } catch (error) {
      this.logger.error(`❌ [UPDATE FERIADO] Erro ao atualizar feriado ${id}:`, error.message);
      throw error;
    }
  }

  @Delete('feriados/:id')
  @ApiOperation({
    summary: 'Remover feriado',
    description: 'Remove um feriado do sistema (soft delete)'
  })
  @ApiParam({
    name: 'id',
    description: 'ID do feriado',
    example: 'fer_01234567890123456789012345'
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Feriado removido com sucesso'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Feriado não encontrado'
  })
  async removerFeriado(@Param('id') id: string): Promise<void> {
    this.logger.log(`🗑️ [DELETE FERIADO] Removendo feriado ${id}`);

    try {
      await this.feriadosService.remover(id);
      this.logger.log(`✅ [DELETE FERIADO] Feriado removido com sucesso`);
    } catch (error) {
      this.logger.error(`❌ [DELETE FERIADO] Erro ao remover feriado ${id}:`, error.message);
      throw error;
    }
  }

  @Post('feriados/:id/plantas')
  @ApiOperation({
    summary: 'Associar feriado a plantas',
    description: 'Associa um feriado específico a uma ou mais plantas'
  })
  @ApiParam({
    name: 'id',
    description: 'ID do feriado',
    example: 'fer_01234567890123456789012345'
  })
  @ApiBody({ type: AssociarPlantasDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plantas associadas com sucesso',
    type: FeriadoResponseDto
  })
  async associarPlantasFeriado(
    @Param('id') id: string,
    @Body() associarDto: AssociarPlantasDto
  ): Promise<FeriadoResponseDto> {
    this.logger.log(`🔗 [ASSOCIAR PLANTAS FERIADO] Associando ${associarDto.plantaIds.length} plantas ao feriado ${id}`);

    try {
      const feriado = await this.feriadosService.associarPlantas(id, associarDto);
      this.logger.log(`✅ [ASSOCIAR PLANTAS FERIADO] Plantas associadas com sucesso`);
      return feriado;
    } catch (error) {
      this.logger.error(`❌ [ASSOCIAR PLANTAS FERIADO] Erro:`, error.message);
      throw error;
    }
  }

  @Delete('feriados/:id/plantas/:plantaId')
  @ApiOperation({
    summary: 'Desassociar planta de feriado',
    description: 'Remove a associação entre um feriado e uma planta específica'
  })
  @ApiParam({
    name: 'id',
    description: 'ID do feriado',
    example: 'fer_01234567890123456789012345'
  })
  @ApiParam({
    name: 'plantaId',
    description: 'ID da planta',
    example: 'plt_01234567890123456789012345'
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Planta desassociada com sucesso'
  })
  async desassociarPlantaFeriado(
    @Param('id') id: string,
    @Param('plantaId') plantaId: string
  ): Promise<void> {
    this.logger.log(`🔓 [DESASSOCIAR PLANTA FERIADO] Desassociando planta ${plantaId} do feriado ${id}`);

    try {
      await this.feriadosService.desassociarPlanta(id, plantaId);
      this.logger.log(`✅ [DESASSOCIAR PLANTA FERIADO] Planta desassociada com sucesso`);
    } catch (error) {
      this.logger.error(`❌ [DESASSOCIAR PLANTA FERIADO] Erro:`, error.message);
      throw error;
    }
  }

  // ==================== CONFIGURAÇÕES DE DIAS ÚTEIS ====================

  @Post('configuracoes-dias-uteis')
  @ApiOperation({
    summary: 'Criar configuração de dias úteis',
    description: 'Cadastra uma nova configuração de dias úteis'
  })
  @ApiBody({ type: CreateConfiguracaoDiasUteisDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Configuração criada com sucesso',
    type: ConfiguracaoDiasUteisResponseDto
  })
  async criarConfiguracao(
    @Body() createDto: CreateConfiguracaoDiasUteisDto
  ): Promise<ConfiguracaoDiasUteisResponseDto> {
    this.logger.log(`⚙️ [CREATE CONFIG] Criando configuração: ${createDto.nome}`);

    try {
      const configuracao = await this.configuracoesService.criar(createDto);
      this.logger.log(`✅ [CREATE CONFIG] Configuração criada - ID: ${configuracao.id}`);
      return configuracao;
    } catch (error) {
      this.logger.error(`❌ [CREATE CONFIG] Erro ao criar configuração:`, error.message);
      throw error;
    }
  }

  @Get('configuracoes-dias-uteis')
  @ApiOperation({
    summary: 'Listar configurações de dias úteis',
    description: 'Retorna lista paginada de configurações com filtros opcionais'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de configurações retornada com sucesso'
  })
  async listarConfiguracoes(
    @Query(new ValidationPipe({ transform: true })) queryDto: QueryConfiguracoesDto
  ): Promise<PaginatedResponse<ConfiguracaoDiasUteisResponseDto>> {
    this.logger.log(`📋 [LIST CONFIGS] Buscando configurações`);

    try {
      const result = await this.configuracoesService.buscarTodos(queryDto);
      this.logger.log(`✅ [LIST CONFIGS] Encontradas ${result.data.length} configurações`);
      return result;
    } catch (error) {
      this.logger.error(`❌ [LIST CONFIGS] Erro:`, error.message);
      throw error;
    }
  }

  @Get('configuracoes-dias-uteis/:id')
  @ApiOperation({
    summary: 'Buscar configuração por ID',
    description: 'Retorna os detalhes de uma configuração específica'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Configuração encontrada com sucesso',
    type: ConfiguracaoDiasUteisResponseDto
  })
  async buscarConfiguracao(@Param('id') id: string): Promise<ConfiguracaoDiasUteisResponseDto> {
    this.logger.log(`🔍 [GET CONFIG] Buscando configuração ID: ${id}`);

    try {
      const configuracao = await this.configuracoesService.buscarPorId(id);
      this.logger.log(`✅ [GET CONFIG] Configuração encontrada: ${configuracao.nome}`);
      return configuracao;
    } catch (error) {
      this.logger.error(`❌ [GET CONFIG] Erro:`, error.message);
      throw error;
    }
  }

  @Put('configuracoes-dias-uteis/:id')
  @ApiOperation({
    summary: 'Atualizar configuração',
    description: 'Atualiza uma configuração de dias úteis existente'
  })
  @ApiBody({ type: UpdateConfiguracaoDiasUteisDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Configuração atualizada com sucesso',
    type: ConfiguracaoDiasUteisResponseDto
  })
  async atualizarConfiguracao(
    @Param('id') id: string,
    @Body() updateDto: UpdateConfiguracaoDiasUteisDto
  ): Promise<ConfiguracaoDiasUteisResponseDto> {
    this.logger.log(`🔄 [UPDATE CONFIG] Atualizando configuração ${id}`);

    try {
      const configuracao = await this.configuracoesService.atualizar(id, updateDto);
      this.logger.log(`✅ [UPDATE CONFIG] Configuração atualizada: ${configuracao.nome}`);
      return configuracao;
    } catch (error) {
      this.logger.error(`❌ [UPDATE CONFIG] Erro:`, error.message);
      throw error;
    }
  }

  @Delete('configuracoes-dias-uteis/:id')
  @ApiOperation({
    summary: 'Remover configuração',
    description: 'Remove uma configuração do sistema (soft delete)'
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Configuração removida com sucesso'
  })
  async removerConfiguracao(@Param('id') id: string): Promise<void> {
    this.logger.log(`🗑️ [DELETE CONFIG] Removendo configuração ${id}`);

    try {
      await this.configuracoesService.remover(id);
      this.logger.log(`✅ [DELETE CONFIG] Configuração removida com sucesso`);
    } catch (error) {
      this.logger.error(`❌ [DELETE CONFIG] Erro:`, error.message);
      throw error;
    }
  }

  @Post('configuracoes-dias-uteis/:id/plantas')
  @ApiOperation({
    summary: 'Associar configuração a plantas',
    description: 'Associa uma configuração de dias úteis a uma ou mais plantas'
  })
  @ApiBody({ type: AssociarPlantasDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plantas associadas com sucesso',
    type: ConfiguracaoDiasUteisResponseDto
  })
  async associarPlantasConfiguracao(
    @Param('id') id: string,
    @Body() associarDto: AssociarPlantasDto
  ): Promise<ConfiguracaoDiasUteisResponseDto> {
    this.logger.log(`🔗 [ASSOCIAR PLANTAS CONFIG] Associando plantas à configuração ${id}`);

    try {
      const configuracao = await this.configuracoesService.associarPlantas(id, associarDto);
      this.logger.log(`✅ [ASSOCIAR PLANTAS CONFIG] Plantas associadas com sucesso`);
      return configuracao;
    } catch (error) {
      this.logger.error(`❌ [ASSOCIAR PLANTAS CONFIG] Erro:`, error.message);
      throw error;
    }
  }

  // ==================== UTILITÁRIOS ====================

  @Get('verificar-dia-util')
  @ApiOperation({
    summary: 'Verificar se uma data é dia útil',
    description: 'Verifica se uma data específica é dia útil considerando feriados e configurações'
  })
  @ApiQuery({ name: 'data', required: true, type: String, description: 'Data no formato YYYY-MM-DD', example: '2024-12-25' })
  @ApiQuery({ name: 'plantaId', required: false, type: String, description: 'ID da planta para configurações específicas' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verificação realizada com sucesso'
  })
  async verificarDiaUtil(@Query() query: any): Promise<DiaUtilResponse> {
    const { data, plantaId } = query;
    this.logger.log(`🗓️ [VERIFICAR DIA UTIL] Verificando data: ${data}, planta: ${plantaId || 'geral'}`);

    try {
      const dto: VerificarDiaUtilDto = {
        data: new Date(data),
        plantaId
      };

      const resultado = await this.agendaService.verificarDiaUtil(dto);
      this.logger.log(`✅ [VERIFICAR DIA UTIL] ${data} é ${resultado.ehDiaUtil ? 'dia útil' : 'não é dia útil'}`);
      return resultado;
    } catch (error) {
      this.logger.error(`❌ [VERIFICAR DIA UTIL] Erro:`, error.message);
      throw error;
    }
  }

  @Get('proximos-dias-uteis')
  @ApiOperation({
    summary: 'Obter próximos dias úteis',
    description: 'Retorna os próximos N dias úteis a partir de uma data'
  })
  @ApiQuery({ name: 'quantidade', required: true, type: Number, description: 'Quantidade de dias úteis', example: 5 })
  @ApiQuery({ name: 'dataInicio', required: false, type: String, description: 'Data de início (padrão: hoje)', example: '2024-01-01' })
  @ApiQuery({ name: 'plantaId', required: false, type: String, description: 'ID da planta para configurações específicas' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Próximos dias úteis obtidos com sucesso'
  })
  async proximosDiasUteis(@Query() query: any): Promise<ProximosDiasUteisResponse> {
    const { quantidade, dataInicio, plantaId } = query;
    this.logger.log(`📅 [PROXIMOS DIAS UTEIS] Buscando ${quantidade} dias úteis`);

    try {
      const dto: ProximosDiasUteisDto = {
        quantidade: parseInt(quantidade),
        dataInicio: dataInicio ? new Date(dataInicio) : undefined,
        plantaId
      };

      const resultado = await this.agendaService.obterProximosDiasUteis(dto);
      this.logger.log(`✅ [PROXIMOS DIAS UTEIS] Encontrados ${resultado.diasEncontrados} dias úteis`);
      return resultado;
    } catch (error) {
      this.logger.error(`❌ [PROXIMOS DIAS UTEIS] Erro:`, error.message);
      throw error;
    }
  }

  @Get('calendario/:ano/:mes')
  @ApiOperation({
    summary: 'Obter calendário do mês',
    description: 'Retorna o calendário completo de um mês com informações de dias úteis'
  })
  @ApiParam({ name: 'ano', description: 'Ano', example: 2024 })
  @ApiParam({ name: 'mes', description: 'Mês (1-12)', example: 12 })
  @ApiQuery({ name: 'plantaId', required: false, type: String, description: 'ID da planta para configurações específicas' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Calendário obtido com sucesso'
  })
  async obterCalendario(
    @Param('ano') ano: string,
    @Param('mes') mes: string,
    @Query('plantaId') plantaId?: string
  ): Promise<DiaUtilResponse[]> {
    this.logger.log(`📅 [CALENDARIO] Obtendo calendário ${mes}/${ano}`);

    try {
      const calendario = await this.agendaService.obterCalendarioMes(
        parseInt(ano),
        parseInt(mes),
        plantaId
      );
      this.logger.log(`✅ [CALENDARIO] Calendário obtido com ${calendario.length} dias`);
      return calendario;
    } catch (error) {
      this.logger.error(`❌ [CALENDARIO] Erro:`, error.message);
      throw error;
    }
  }
}
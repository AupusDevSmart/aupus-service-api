import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { EquipamentosService } from './equipamentos.service';
import { EquipamentosDataService } from './services/equipamentos-data.service';
import { CreateEquipamentoDto } from './dto/create-equipamento.dto';
import { UpdateEquipamentoDto } from './dto/update-equipamento.dto';
import { EquipamentoQueryDto } from './dto/equipamento-query.dto';
import { CreateComponenteUARDto } from './dto/componente-uar.dto';
import { ConfigurarMqttDto } from './dto/configurar-mqtt.dto';

@ApiTags('Equipamentos')
@Controller('equipamentos')
export class EquipamentosController {
  constructor(
    private readonly equipamentosService: EquipamentosService,
    private readonly equipamentosDataService: EquipamentosDataService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar novo equipamento/componente' })
  @ApiResponse({ status: 201, description: 'Equipamento criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  create(@Body() createDto: CreateEquipamentoDto) {
    return this.equipamentosService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar equipamentos com filtros e paginação' })
  @ApiResponse({ status: 200, description: 'Lista de equipamentos' })
  findAll(@Query() query: EquipamentoQueryDto) {
    return this.equipamentosService.findAll(query);
  }

  @Get('ucs-disponiveis')
  @ApiOperation({ summary: 'Listar equipamentos UC disponíveis para serem pais de UAR' })
  @ApiResponse({ status: 200, description: 'Lista de equipamentos UC' })
  findEquipamentosUC() {
    return this.equipamentosService.findEquipamentosUC();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar equipamento por ID' })
  @ApiResponse({ status: 200, description: 'Equipamento encontrado' })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado' })
  findOne(@Param('id') id: string) {
    return this.equipamentosService.findOne(id);
  }

  @Get(':id/componentes')
  @ApiOperation({ summary: 'Listar componentes UAR de um equipamento UC' })
  @ApiResponse({ status: 200, description: 'Lista de componentes' })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado' })
  findComponentes(@Param('id') id: string) {
    return this.equipamentosService.findComponentesByEquipamento(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar equipamento' })
  @ApiResponse({ status: 200, description: 'Equipamento atualizado' })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado' })
  update(@Param('id') id: string, @Body() updateDto: UpdateEquipamentoDto) {
    return this.equipamentosService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover equipamento (soft delete)' })
  @ApiResponse({ status: 204, description: 'Equipamento removido' })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado' })
  remove(@Param('id') id: string) {
    return this.equipamentosService.remove(id);
  }

  @Get('uar/:id/detalhes')
  @ApiOperation({ summary: 'Buscar detalhes completos de um componente UAR' })
  @ApiResponse({ status: 200, description: 'Detalhes do componente UAR' })
  @ApiResponse({ status: 404, description: 'Componente UAR não encontrado' })
  findUARDetalhes(@Param('id') uarId: string) {
    return this.equipamentosService.findUARDetalhes(uarId);
  }

  @Get(':ucId/componentes/gerenciar')
  @ApiOperation({ summary: 'Listar componentes UAR para gerenciamento de uma UC' })
  @ApiResponse({ status: 200, description: 'Lista de componentes com dados completos' })
  @ApiResponse({ status: 404, description: 'Equipamento UC não encontrado' })
  findComponentesParaGerenciar(@Param('ucId') ucId: string) {
    return this.equipamentosService.findComponentesParaGerenciar(ucId);
  }

  @Put(':ucId/componentes/batch')
  @ApiOperation({ summary: 'Salvar múltiplos componentes UAR de uma vez' })
  @ApiResponse({ status: 200, description: 'Componentes salvos com sucesso' })
  salvarComponentesUAR(
    @Param('ucId') ucId: string,
    @Body() componentesDto: { componentes: CreateComponenteUARDto[] }
  ) {
    return this.equipamentosService.salvarComponentesUARLote(ucId, componentesDto.componentes);
  }

  @Get('unidade/:unidadeId/equipamentos')
  @ApiOperation({ summary: 'Listar equipamentos de uma unidade específica' })
  @ApiResponse({ status: 200, description: 'Lista de equipamentos da unidade' })
  findByUnidade(
    @Param('unidadeId') unidadeId: string,
    @Query() query: EquipamentoQueryDto
  ) {
    return this.equipamentosService.findByUnidade(unidadeId, query);
  }

  @Get('unidades/:unidadeId/estatisticas')
  @ApiOperation({ summary: 'Estatísticas dos equipamentos de uma unidade' })
  @ApiResponse({ status: 200, description: 'Estatísticas da unidade' })
  getEstatisticasUnidade(@Param('unidadeId') unidadeId: string) {
    return this.equipamentosService.getEstatisticasUnidade(unidadeId);
  }

  // ==========================================
  // Rotas de MQTT e Dados em Tempo Real
  // ==========================================

  @Post('virtual/:unidadeId/:tipo')
  @ApiOperation({ summary: 'Criar componente visual (BARRAMENTO ou PONTO) para diagramas' })
  @ApiResponse({ status: 201, description: 'Componente visual criado' })
  @ApiResponse({ status: 404, description: 'Unidade não encontrada' })
  criarComponenteVisual(
    @Param('unidadeId') unidadeId: string,
    @Param('tipo') tipo: 'BARRAMENTO' | 'PONTO',
    @Body() body?: { nome?: string },
  ) {
    return this.equipamentosService.criarComponenteVisual(unidadeId, tipo, body?.nome);
  }

  @Patch(':id/mqtt')
  @ApiOperation({ summary: 'Configurar tópico MQTT de um equipamento' })
  @ApiResponse({ status: 200, description: 'Configuração MQTT atualizada' })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado' })
  configurarMqtt(
    @Param('id') id: string,
    @Body() dto: ConfigurarMqttDto,
  ) {
    return this.equipamentosService.configurarMqtt(id, dto);
  }

  @Get(':id/dados/atual')
  @ApiOperation({ summary: 'Obter último dado recebido do equipamento' })
  @ApiResponse({ status: 200, description: 'Dado atual do equipamento' })
  @ApiResponse({ status: 404, description: 'Equipamento ou dado não encontrado' })
  obterDadoAtual(@Param('id') id: string) {
    return this.equipamentosDataService.obterDadoAtual(id);
  }

  @Get(':id/dados/historico')
  @ApiOperation({ summary: 'Obter histórico de dados do equipamento' })
  @ApiQuery({ name: 'inicio', required: false, description: 'Data/hora inicial (ISO 8601)' })
  @ApiQuery({ name: 'fim', required: false, description: 'Data/hora final (ISO 8601)' })
  @ApiQuery({ name: 'limite', required: false, description: 'Máximo de registros', type: Number })
  @ApiQuery({ name: 'intervalo', required: false, description: 'Agrupamento: raw, 1min, 5min, 1hour, 1day' })
  @ApiResponse({ status: 200, description: 'Histórico de dados' })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado' })
  obterHistorico(
    @Param('id') id: string,
    @Query('inicio') inicio?: string,
    @Query('fim') fim?: string,
    @Query('limite') limite?: string,
    @Query('intervalo') intervalo?: 'raw' | '1min' | '5min' | '1hour' | '1day',
  ) {
    return this.equipamentosDataService.obterHistorico(id, {
      inicio: inicio ? new Date(inicio) : undefined,
      fim: fim ? new Date(fim) : undefined,
      limite: limite ? parseInt(limite, 10) : undefined,
      intervalo: intervalo || 'raw',
    });
  }
}
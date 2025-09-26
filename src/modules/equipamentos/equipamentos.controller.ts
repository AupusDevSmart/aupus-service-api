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
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EquipamentosService } from './equipamentos.service';
import { CreateEquipamentoDto } from './dto/create-equipamento.dto';
import { UpdateEquipamentoDto } from './dto/update-equipamento.dto';
import { EquipamentoQueryDto } from './dto/equipamento-query.dto';
import { CreateComponenteUARDto } from './dto/componente-uar.dto';

@ApiTags('Equipamentos')
@Controller('equipamentos')
export class EquipamentosController {
  constructor(private readonly equipamentosService: EquipamentosService) {}

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

  @Get('planta/:plantaId/equipamentos')
  @ApiOperation({ summary: 'Listar equipamentos de uma planta específica' })
  @ApiResponse({ status: 200, description: 'Lista de equipamentos da planta' })
  findByPlanta(
    @Param('plantaId') plantaId: string, 
    @Query() query: EquipamentoQueryDto
  ) {
    return this.equipamentosService.findByPlanta(plantaId, query);
  }

  @Get('plantas/:plantaId/estatisticas')
  @ApiOperation({ summary: 'Estatísticas dos equipamentos de uma planta' })
  @ApiResponse({ status: 200, description: 'Estatísticas da planta' })
  getEstatisticasPlanta(@Param('plantaId') plantaId: string) {
    return this.equipamentosService.getEstatisticasPlanta(plantaId);
  }
}
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ReservasService } from './reservas.service';
import {
  CreateReservaDto,
  UpdateReservaDto,
  QueryReservasDto,
  ReservaResponseDto,
  CancelarReservaDto
} from './dto';

@ApiTags('Reservas de Veículos')
@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservasService: ReservasService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova reserva de veículo' })
  @ApiResponse({
    status: 201,
    description: 'Reserva criada com sucesso',
    type: ReservaResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou veículo não disponível'
  })
  @ApiResponse({
    status: 404,
    description: 'Veículo não encontrado'
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito de horário com outra reserva'
  })
  async criarReserva(
    @Body() createDto: CreateReservaDto
  ): Promise<ReservaResponseDto> {
    return this.reservasService.criar(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar reservas com paginação e filtros' })
  @ApiResponse({
    status: 200,
    description: 'Lista de reservas retornada com sucesso'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página (padrão: 20)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Busca por responsável, finalidade, veículo' })
  @ApiQuery({ name: 'status', required: false, enum: ['ativa', 'cancelada', 'finalizada'] })
  @ApiQuery({ name: 'veiculoId', required: false, type: String, description: 'Filtrar por veículo' })
  @ApiQuery({ name: 'responsavel', required: false, type: String, description: 'Filtrar por responsável' })
  @ApiQuery({ name: 'tipoSolicitante', required: false, enum: ['ordem_servico', 'viagem', 'transporte', 'outros'] })
  @ApiQuery({ name: 'dataInicio', required: false, type: String, description: 'Data de início mínima (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dataFim', required: false, type: String, description: 'Data de fim máxima (YYYY-MM-DD)' })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['responsavel', 'dataInicio', 'dataFim', 'status', 'finalidade', 'criadoEm'] })
  @ApiQuery({ name: 'orderDirection', required: false, enum: ['asc', 'desc'] })
  async listarReservas(@Query() queryDto: QueryReservasDto) {
    return this.reservasService.buscarTodos(queryDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar reserva por ID' })
  @ApiResponse({
    status: 200,
    description: 'Reserva encontrada',
    type: ReservaResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Reserva não encontrada'
  })
  async buscarReservaPorId(@Param('id') id: string): Promise<ReservaResponseDto> {
    return this.reservasService.buscarPorId(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar reserva' })
  @ApiResponse({
    status: 200,
    description: 'Reserva atualizada com sucesso',
    type: ReservaResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Reserva não encontrada'
  })
  @ApiResponse({
    status: 400,
    description: 'Não é possível editar reserva não ativa ou dados inválidos'
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito de horário com outra reserva'
  })
  async atualizarReserva(
    @Param('id') id: string,
    @Body() updateDto: UpdateReservaDto
  ): Promise<ReservaResponseDto> {
    return this.reservasService.atualizar(id, updateDto);
  }

  @Patch(':id/cancelar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancelar reserva' })
  @ApiResponse({
    status: 204,
    description: 'Reserva cancelada com sucesso'
  })
  @ApiResponse({
    status: 404,
    description: 'Reserva não encontrada'
  })
  @ApiResponse({
    status: 400,
    description: 'Não é possível cancelar reserva não ativa'
  })
  async cancelarReserva(
    @Param('id') id: string,
    @Body() cancelarDto: CancelarReservaDto
  ): Promise<void> {
    return this.reservasService.cancelar(
      id,
      cancelarDto.motivo
    );
  }

  @Patch(':id/finalizar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Finalizar reserva' })
  @ApiResponse({
    status: 204,
    description: 'Reserva finalizada com sucesso'
  })
  @ApiResponse({
    status: 404,
    description: 'Reserva não encontrada'
  })
  @ApiResponse({
    status: 400,
    description: 'Não é possível finalizar reserva não ativa'
  })
  async finalizarReserva(@Param('id') id: string): Promise<void> {
    return this.reservasService.finalizar(id);
  }

  @Get('veiculo/:veiculoId')
  @ApiOperation({ summary: 'Listar reservas de um veículo específico' })
  @ApiResponse({
    status: 200,
    description: 'Lista de reservas do veículo retornada com sucesso',
    type: [ReservaResponseDto]
  })
  @ApiQuery({ name: 'incluirFinalizadas', required: false, type: Boolean, description: 'Incluir reservas finalizadas' })
  async listarReservasVeiculo(
    @Param('veiculoId') veiculoId: string,
    @Query('incluirFinalizadas') incluirFinalizadas?: boolean
  ): Promise<ReservaResponseDto[]> {
    return this.reservasService.buscarReservasVeiculo(veiculoId, incluirFinalizadas);
  }
}
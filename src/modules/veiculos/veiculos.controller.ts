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
import { VeiculosService } from './veiculos.service';
import {
  CreateVeiculoDto,
  UpdateVeiculoDto,
  QueryVeiculosDto,
  VeiculoResponseDto,
  AlterarStatusVeiculoDto,
  InativarVeiculoDto,
  VeiculosDisponiveisDto
} from './dto';

@ApiTags('Veículos')
@Controller('veiculos')
export class VeiculosController {
  constructor(private readonly veiculosService: VeiculosService) {}

  @Post()
  @ApiOperation({ summary: 'Criar novo veículo' })
  @ApiResponse({
    status: 201,
    description: 'Veículo criado com sucesso',
    type: VeiculoResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos'
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito - placa, chassi ou código patrimonial já existe'
  })
  async criarVeiculo(
    @Body() createDto: CreateVeiculoDto
  ): Promise<VeiculoResponseDto> {
    return this.veiculosService.criar(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar veículos com paginação e filtros' })
  @ApiResponse({
    status: 200,
    description: 'Lista de veículos retornada com sucesso'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página (padrão: 20)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Busca por nome, placa, marca ou modelo' })
  @ApiQuery({ name: 'status', required: false, enum: ['disponivel', 'em_uso', 'manutencao', 'inativo'] })
  @ApiQuery({ name: 'tipo', required: false, enum: ['carro', 'van', 'caminhao', 'moto', 'onibus'] })
  @ApiQuery({ name: 'tipoCombustivel', required: false, enum: ['gasolina', 'etanol', 'diesel', 'flex', 'eletrico', 'hibrido'] })
  @ApiQuery({ name: 'plantaId', required: false, type: String, description: 'Filtrar por planta' })
  @ApiQuery({ name: 'responsavel', required: false, type: String, description: 'Filtrar por responsável' })
  @ApiQuery({ name: 'ativo', required: false, type: Boolean, description: 'Filtrar por status ativo (padrão: true)' })
  @ApiQuery({ name: 'marca', required: false, type: String, description: 'Filtrar por marca' })
  @ApiQuery({ name: 'anoFabricacao', required: false, type: Number, description: 'Filtrar por ano de fabricação' })
  @ApiQuery({ name: 'capacidadeMinima', required: false, type: Number, description: 'Capacidade mínima de passageiros' })
  @ApiQuery({ name: 'apenasDisponiveis', required: false, type: Boolean, description: 'Apenas veículos disponíveis para reserva' })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['nome', 'placa', 'marca', 'modelo', 'anoFabricacao', 'quilometragem', 'criadoEm'] })
  @ApiQuery({ name: 'orderDirection', required: false, enum: ['asc', 'desc'] })
  async listarVeiculos(@Query() queryDto: QueryVeiculosDto) {
    return this.veiculosService.buscarTodos(queryDto);
  }

  @Get('disponiveis')
  @ApiOperation({ summary: 'Buscar veículos disponíveis para período específico' })
  @ApiResponse({
    status: 200,
    description: 'Veículos disponíveis retornados com sucesso'
  })
  @ApiResponse({
    status: 400,
    description: 'Parâmetros inválidos'
  })
  async buscarVeiculosDisponiveis(@Query() queryDto: VeiculosDisponiveisDto) {
    return this.veiculosService.buscarDisponiveis(queryDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar veículo por ID' })
  @ApiResponse({
    status: 200,
    description: 'Veículo encontrado',
    type: VeiculoResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Veículo não encontrado'
  })
  async buscarVeiculoPorId(@Param('id') id: string): Promise<VeiculoResponseDto> {
    return this.veiculosService.buscarPorId(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar dados do veículo' })
  @ApiResponse({
    status: 200,
    description: 'Veículo atualizado com sucesso',
    type: VeiculoResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Veículo não encontrado'
  })
  @ApiResponse({
    status: 400,
    description: 'Não é possível alterar veículo com reservas ativas'
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito - placa já existe'
  })
  async atualizarVeiculo(
    @Param('id') id: string,
    @Body() updateDto: UpdateVeiculoDto
  ): Promise<VeiculoResponseDto> {
    return this.veiculosService.atualizar(id, updateDto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Alterar status do veículo' })
  @ApiResponse({
    status: 200,
    description: 'Status alterado com sucesso',
    type: VeiculoResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Veículo não encontrado'
  })
  @ApiResponse({
    status: 400,
    description: 'Transição de status inválida'
  })
  @ApiResponse({
    status: 409,
    description: 'Não é possível alterar status de veículo com reservas ativas'
  })
  async alterarStatus(
    @Param('id') id: string,
    @Body() alterarStatusDto: AlterarStatusVeiculoDto
  ): Promise<VeiculoResponseDto> {
    return this.veiculosService.alterarStatus(
      id,
      alterarStatusDto
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Inativar veículo' })
  @ApiResponse({
    status: 204,
    description: 'Veículo inativado com sucesso'
  })
  @ApiResponse({
    status: 404,
    description: 'Veículo não encontrado'
  })
  @ApiResponse({
    status: 409,
    description: 'Não é possível inativar veículo com reservas ativas'
  })
  async inativarVeiculo(
    @Param('id') id: string,
    @Body() inativarDto: InativarVeiculoDto
  ): Promise<void> {
    return this.veiculosService.inativar(
      id,
      inativarDto
    );
  }
}
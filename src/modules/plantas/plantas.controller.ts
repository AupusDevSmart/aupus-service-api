// src/modules/plantas/plantas.controller.ts - CORRIGIDO
import { 
  Controller, 
  Post, 
  Get, 
  Put,
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
import { PlantasService, PaginatedResponse } from './plantas.service';
import { CreatePlantaDto } from './dto/create-planta.dto';
import { UpdatePlantaDto } from './dto/update-planta.dto';
import { FindAllPlantasDto } from './dto/find-all-plantas.dto';
import { Planta, ProprietarioBasico } from './entities/planta.entity';

@ApiTags('plantas')
@Controller('plantas') // ✅ CORRIGIDO: Remover 'api/v1' - só deixar 'plantas'
export class PlantasController {
  private readonly logger = new Logger(PlantasController.name);

  constructor(private readonly plantasService: PlantasService) {}

  // ✅ IMPORTANTE: Rota específica ANTES da rota genérica com parâmetro
  @Get('proprietarios')
  @ApiOperation({ 
    summary: 'Listar proprietários disponíveis',
    description: 'Retorna lista de usuários que podem ser proprietários de plantas'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de proprietários retornada com sucesso',
    type: [ProprietarioBasico]
  })
  async findProprietarios(): Promise<ProprietarioBasico[]> {
    this.logger.log(`👥 [LIST PROPRIETARIOS] Buscando proprietários disponíveis`);

    try {
      const proprietarios = await this.plantasService.findProprietarios();
      
      this.logger.log(`✅ [LIST PROPRIETARIOS] Encontrados ${proprietarios.length} proprietários`);
      return proprietarios;
      
    } catch (error) {
      this.logger.error(`❌ [LIST PROPRIETARIOS] Erro ao buscar proprietários:`, error.message);
      throw error;
    }
  }

  // ✅ ROTA: POST /api/v1/plantas (Criar nova planta)
  @Post()
  @ApiOperation({ 
    summary: 'Criar nova planta',
    description: 'Cadastra uma nova planta no sistema com todas as informações necessárias'
  })
  @ApiBody({ type: CreatePlantaDto })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Planta criada com sucesso',
    type: Planta 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Dados inválidos ou erro de validação' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Proprietário não encontrado' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'CNPJ já cadastrado no sistema' 
  })
  async create(@Body() createPlantaDto: CreatePlantaDto): Promise<Planta> {
    this.logger.log(`🏭 [CREATE PLANTA] Iniciando criação de planta`);
    this.logger.log(`📝 [CREATE PLANTA] Dados recebidos:`, JSON.stringify(createPlantaDto, null, 2));

    try {
      const planta = await this.plantasService.create(createPlantaDto);
      
      this.logger.log(`✅ [CREATE PLANTA] Planta criada com sucesso - ID: ${planta.id}`);
      return planta;
      
    } catch (error) {
      this.logger.error(`❌ [CREATE PLANTA] Erro ao criar planta:`, error.message);
      throw error;
    }
  }

  // ✅ ROTA: GET /api/v1/plantas (Listar plantas com filtros e paginação)
  @Get()
  @ApiOperation({ 
    summary: 'Listar plantas',
    description: 'Retorna lista paginada de plantas com filtros opcionais'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número da página', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página', example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Busca por nome, CNPJ, localização' })
  @ApiQuery({ name: 'proprietarioId', required: false, type: String, description: 'Filtrar por proprietário' })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['nome', 'cnpj', 'localizacao', 'cidade', 'criadoEm', 'proprietario'], description: 'Campo para ordenação' })
  @ApiQuery({ name: 'orderDirection', required: false, enum: ['asc', 'desc'], description: 'Direção da ordenação' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de plantas retornada com sucesso'
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Parâmetros inválidos' 
  })
  async findAll(
    @Query(new ValidationPipe({ transform: true })) queryDto: FindAllPlantasDto
  ): Promise<PaginatedResponse<Planta>> {
    this.logger.log(`📋 [LIST PLANTAS] Buscando plantas com filtros:`, JSON.stringify(queryDto, null, 2));

    try {
      const result = await this.plantasService.findAll(queryDto);
      
      this.logger.log(`✅ [LIST PLANTAS] Encontradas ${result.data.length} plantas de ${result.pagination.total} total`);
      return result;
      
    } catch (error) {
      this.logger.error(`❌ [LIST PLANTAS] Erro ao buscar plantas:`, error.message);
      throw error;
    }
  }

  // ✅ ROTA: GET /api/v1/plantas/:id (Buscar planta específica)
  @Get(':id')
  @ApiOperation({ 
    summary: 'Buscar planta por ID',
    description: 'Retorna os detalhes de uma planta específica'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID da planta', 
    example: 'plt_01234567890123456789012345'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Planta encontrada com sucesso',
    type: Planta 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Planta não encontrada' 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'ID inválido' 
  })
  async findOne(
    @Param('id') id: string
  ): Promise<Planta> {
    this.logger.log(`🔍 [GET PLANTA] Buscando planta com ID: ${id}`);

    try {
      const planta = await this.plantasService.findOne(id);
      
      this.logger.log(`✅ [GET PLANTA] Planta encontrada: ${planta.nome}`);
      return planta;
      
    } catch (error) {
      this.logger.error(`❌ [GET PLANTA] Erro ao buscar planta ${id}:`, error.message);
      throw error;
    }
  }

  // ✅ ROTA: PUT /api/v1/plantas/:id (Atualizar planta)
  @Put(':id')
  @ApiOperation({ 
    summary: 'Atualizar planta',
    description: 'Atualiza os dados de uma planta existente'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID da planta', 
    example: 'plt_01234567890123456789012345'
  })
  @ApiBody({ type: UpdatePlantaDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Planta atualizada com sucesso',
    type: Planta 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Planta não encontrada' 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Dados inválidos ou erro de validação' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'CNPJ já cadastrado por outra planta' 
  })
  async update(
    @Param('id') id: string,
    @Body() updatePlantaDto: UpdatePlantaDto
  ): Promise<Planta> {
    this.logger.log(`🔄 [UPDATE PLANTA] Atualizando planta ${id}`);
    this.logger.log(`📝 [UPDATE PLANTA] Dados recebidos:`, JSON.stringify(updatePlantaDto, null, 2));

    try {
      const planta = await this.plantasService.update(id, updatePlantaDto);
      
      this.logger.log(`✅ [UPDATE PLANTA] Planta atualizada com sucesso: ${planta.nome}`);
      return planta;
      
    } catch (error) {
      this.logger.error(`❌ [UPDATE PLANTA] Erro ao atualizar planta ${id}:`, error.message);
      throw error;
    }
  }
}
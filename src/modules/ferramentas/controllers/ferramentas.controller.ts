// ===============================
// src/modules/ferramentas/controllers/ferramentas.controller.ts
// ===============================
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { FerramentasService } from '../services/ferramentas.service';
import { CreateFerramentaDto } from '../dto/create-ferramenta.dto';
import { UpdateFerramentaDto } from '../dto/update-ferramenta.dto';
import { QueryFerramentasDto } from '../dto/query-ferramentas.dto';
import { FerramentaEntity } from '../entities/ferramenta.entity';

@ApiTags('Ferramentas')
@Controller('ferramentas')
export class FerramentasController {
  constructor(private readonly ferramentasService: FerramentasService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova ferramenta' })
  @ApiResponse({ status: 201, description: 'Ferramenta criada com sucesso', type: FerramentaEntity })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Código patrimonial já existe na organização' })
  async create(@Body() createFerramentaDto: CreateFerramentaDto): Promise<FerramentaEntity> {
    // TODO: Pegar usuário do contexto de autenticação quando implementado
    const criadoPor = 'cm123temp456def789'; // Temporário
    return this.ferramentasService.create(createFerramentaDto, criadoPor);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ferramentas com filtros e paginação' })
  @ApiResponse({ status: 200, description: 'Lista de ferramentas retornada com sucesso' })
  async findAll(@Query() query: QueryFerramentasDto) {
    return this.ferramentasService.findAll(query);
  }

  @Get('estatisticas')
  @ApiOperation({ summary: 'Obter estatísticas das ferramentas' })
  @ApiQuery({ name: 'organizacao_nome', required: false, type: 'string' })
  @ApiResponse({ status: 200, description: 'Estatísticas retornadas com sucesso' })
  async getStatistics(@Query('organizacao_nome') organizacaoNome?: string) {
    return this.ferramentasService.getStatistics(organizacaoNome);
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Obter alertas de calibração e manutenção' })
  @ApiQuery({ name: 'organizacao_nome', required: false, type: 'string' })
  @ApiResponse({ status: 200, description: 'Alertas retornados com sucesso' })
  async getAlertas(@Query('organizacao_nome') organizacaoNome?: string) {
    return this.ferramentasService.getAlertas(organizacaoNome);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar ferramenta por ID' })
  @ApiParam({ name: 'id', description: 'ID da ferramenta' })
  @ApiResponse({ status: 200, description: 'Ferramenta encontrada', type: FerramentaEntity })
  @ApiResponse({ status: 404, description: 'Ferramenta não encontrada' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FerramentaEntity> {
    return this.ferramentasService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar ferramenta' })
  @ApiParam({ name: 'id', description: 'ID da ferramenta' })
  @ApiResponse({ status: 200, description: 'Ferramenta atualizada com sucesso', type: FerramentaEntity })
  @ApiResponse({ status: 404, description: 'Ferramenta não encontrada' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFerramentaDto: UpdateFerramentaDto,
  ): Promise<FerramentaEntity> {
    // TODO: Pegar usuário do contexto de autenticação quando implementado
    const atualizadoPor = 'cm123temp456def789'; // Temporário
    return this.ferramentasService.update(id, updateFerramentaDto, atualizadoPor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover ferramenta (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID da ferramenta' })
  @ApiResponse({ status: 204, description: 'Ferramenta removida com sucesso' })
  @ApiResponse({ status: 404, description: 'Ferramenta não encontrada' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    // TODO: Pegar usuário do contexto de autenticação quando implementado
    const deletadoPor = 'cm123temp456def789'; // Temporário
    return this.ferramentasService.remove(id, deletadoPor);
  }
}
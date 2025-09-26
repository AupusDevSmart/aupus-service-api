// ===============================
// src/modules/ferramentas/controllers/manutencao.controller.ts
// ===============================
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ManutencaoService } from '../services/manutencao.service';
import { CreateManutencaoDto } from '../dto/create-manutencao.dto';
import { UpdateManutencaoDto } from '../dto/update-manutencao.dto';

@ApiTags('Manutenções')
@Controller('ferramentas/:ferramentaId/manutencoes')
export class ManutencaoController {
  constructor(private readonly manutencaoService: ManutencaoService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar nova manutenção' })
  @ApiParam({ name: 'ferramentaId', description: 'ID da ferramenta' })
  @ApiResponse({ status: 201, description: 'Manutenção registrada com sucesso' })
  @ApiResponse({ status: 404, description: 'Ferramenta não encontrada' })
  async create(
    @Param('ferramentaId', ParseUUIDPipe) ferramentaId: string,
    @Body() createManutencaoDto: CreateManutencaoDto,
  ) {
    // TODO: Pegar usuário do contexto de autenticação quando implementado
    const criadoPor = 'cm123temp456def789'; // Temporário
    return this.manutencaoService.create(ferramentaId, createManutencaoDto, criadoPor);
  }

  @Get()
  @ApiOperation({ summary: 'Listar histórico de manutenções da ferramenta' })
  @ApiParam({ name: 'ferramentaId', description: 'ID da ferramenta' })
  @ApiResponse({ status: 200, description: 'Histórico de manutenções retornado com sucesso' })
  async findAll(@Param('ferramentaId', ParseUUIDPipe) ferramentaId: string) {
    return this.manutencaoService.findAll(ferramentaId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar manutenção' })
  @ApiParam({ name: 'ferramentaId', description: 'ID da ferramenta' })
  @ApiParam({ name: 'id', description: 'ID da manutenção' })
  @ApiResponse({ status: 200, description: 'Manutenção atualizada com sucesso' })
  @ApiResponse({ status: 404, description: 'Manutenção não encontrada' })
  async update(
    @Param('ferramentaId', ParseUUIDPipe) ferramentaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateManutencaoDto: UpdateManutencaoDto,
  ) {
    // TODO: Pegar usuário do contexto de autenticação quando implementado
    const atualizadoPor = 'cm123temp456def789'; // Temporário
    return this.manutencaoService.update(ferramentaId, id, updateManutencaoDto, atualizadoPor);
  }
}
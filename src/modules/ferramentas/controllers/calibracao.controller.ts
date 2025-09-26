// ===============================
// src/modules/ferramentas/controllers/calibracao.controller.ts
// ===============================
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CalibracaoService } from '../services/calibracao.service';
import { CreateCalibracaoDto } from '../dto/create-calibracao.dto';

@ApiTags('Calibrações')
@Controller('ferramentas/:ferramentaId/calibracoes')
export class CalibracaoController {
  constructor(private readonly calibracaoService: CalibracaoService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar nova calibração' })
  @ApiParam({ name: 'ferramentaId', description: 'ID da ferramenta' })
  @ApiResponse({ status: 201, description: 'Calibração registrada com sucesso' })
  @ApiResponse({ status: 404, description: 'Ferramenta não encontrada' })
  async create(
    @Param('ferramentaId', ParseUUIDPipe) ferramentaId: string,
    @Body() createCalibracaoDto: CreateCalibracaoDto,
  ) {
    // TODO: Pegar usuário do contexto de autenticação quando implementado
    const criadoPor = 'cm123temp456def789'; // Temporário
    return this.calibracaoService.create(ferramentaId, createCalibracaoDto, criadoPor);
  }

  @Get()
  @ApiOperation({ summary: 'Listar histórico de calibrações da ferramenta' })
  @ApiParam({ name: 'ferramentaId', description: 'ID da ferramenta' })
  @ApiResponse({ status: 200, description: 'Histórico de calibrações retornado com sucesso' })
  async findAll(@Param('ferramentaId', ParseUUIDPipe) ferramentaId: string) {
    return this.calibracaoService.findAll(ferramentaId);
  }
}
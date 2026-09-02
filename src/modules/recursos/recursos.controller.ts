// src/modules/recursos/recursos.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Permissions } from '@/core';
import { RecursosService } from './recursos.service';
import { CreateRecursoDto, UpdateRecursoDto, QueryRecursosDto } from './dto/recurso.dto';

/**
 * Duas permissões que já existem, em vez de uma nova: `recursos.manage` é a da
 * seção Administração, onde a tela mora; `manutencao.manage` entra porque quem
 * edita instrução precisa ler o catálogo para escolher os recursos, e ficaria
 * travado no combobox sem ela.
 *
 * Criar permissão nova exigiria inserir linhas de RBAC nos dois guards ('web' e
 * 'api') — terreno que já deu problema antes e não vale o risco por uma tela de
 * cadastro.
 */
@ApiTags('Recursos')
@Controller('recursos')
@Permissions('recursos.manage', 'manutencao.manage')
export class RecursosController {
  constructor(private readonly recursosService: RecursosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar recursos do catálogo' })
  @ApiResponse({ status: 200, description: 'Lista paginada' })
  listar(@Query() query: QueryRecursosDto) {
    return this.recursosService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar recurso por ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, description: 'Recurso não encontrado' })
  buscarPorId(@Param('id') id: string) {
    return this.recursosService.buscarPorId(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastrar recurso' })
  @ApiResponse({ status: 409, description: 'Já existe recurso com esse nome na categoria' })
  criar(@Body() dto: CreateRecursoDto) {
    return this.recursosService.criar(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar recurso' })
  @ApiParam({ name: 'id' })
  atualizar(@Param('id') id: string, @Body() dto: UpdateRecursoDto) {
    return this.recursosService.atualizar(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remover recurso',
    description:
      'Recusado enquanto alguma instrução usar o recurso. Para tirar de circulação sem ' +
      'apagar histórico, desative em vez de remover.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 400, description: 'Recurso em uso' })
  remover(@Param('id') id: string) {
    return this.recursosService.remover(id);
  }
}

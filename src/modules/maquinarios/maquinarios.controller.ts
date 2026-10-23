// src/modules/maquinarios/maquinarios.controller.ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/core';
import { MaquinariosService } from './maquinarios.service';
import { CreateMaquinarioDto, QueryMaquinariosDto, UpdateMaquinarioDto } from './dto/maquinario.dto';

/**
 * As permissões do cadastro de recursos, como o próprio recurso faz:
 * `recursos.manage` é a da seção onde a tela mora; `manutencao.manage` entra
 * porque quem edita instrução lê o catálogo para escolher a máquina (SN-85) e
 * cadastra a que falta pelo "+". Alterar e remover é só da tela: `recursos.manage`
 * no método (SN-98).
 * Premissa (SN-84): permissão nova exigiria linhas de RBAC nos dois guards, e
 * o recurso já escolheu não pagar esse risco por uma tela de cadastro.
 */
@ApiTags('Maquinários')
@Controller('maquinarios')
@Permissions('recursos.manage', 'manutencao.manage')
export class MaquinariosController {
  constructor(private readonly maquinariosService: MaquinariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar maquinários' })
  listar(@Query() query: QueryMaquinariosDto) {
    return this.maquinariosService.listar(query);
  }

  // Antes de ':id', senão "catalogo" seria lido como um id
  @Get('catalogo')
  @ApiOperation({ summary: 'O que o formulário pode oferecer: tipos, bases e rubricas (a mesma regra da gravação)' })
  catalogo() {
    return this.maquinariosService.catalogo();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar maquinário por ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, description: 'Maquinário não encontrado' })
  buscarPorId(@Param('id') id: string) {
    return this.maquinariosService.detalhar(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastrar maquinário' })
  @ApiResponse({ status: 409, description: 'Já existe maquinário com esse nome' })
  criar(@Body() dto: CreateMaquinarioDto) {
    return this.maquinariosService.criar(dto);
  }

  @Put(':id')
  @Permissions('recursos.manage')
  @ApiOperation({ summary: 'Atualizar maquinário' })
  @ApiParam({ name: 'id' })
  atualizar(@Param('id') id: string, @Body() dto: UpdateMaquinarioDto) {
    return this.maquinariosService.atualizar(id, dto);
  }

  @Delete(':id')
  @Permissions('recursos.manage')
  @ApiOperation({ summary: 'Remover maquinário (exclusão lógica)' })
  @ApiParam({ name: 'id' })
  remover(@Param('id') id: string) {
    return this.maquinariosService.remover(id);
  }
}

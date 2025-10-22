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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DiagramasService } from './services/diagramas.service';
import { EquipamentosDiagramaService } from './services/equipamentos-diagrama.service';
import { ConexoesDiagramaService } from './services/conexoes-diagrama.service';
import { CreateDiagramaDto } from './dto/create-diagrama.dto';
import { UpdateDiagramaDto } from './dto/update-diagrama.dto';
import {
  AddEquipamentoDiagramaDto,
  UpdateEquipamentoDiagramaDto,
  AddEquipamentosBulkDto,
} from './dto/add-equipamento-diagrama.dto';
import {
  CreateConexaoDto,
  UpdateConexaoDto,
  CreateConexoesBulkDto,
} from './dto/create-conexao.dto';

@ApiTags('Diagramas Sinópticos')
// @ApiBearerAuth() // TODO: Descomentar quando implementar autenticação
// @UseGuards(JwtAuthGuard) // TODO: Descomentar quando implementar autenticação
@Controller('diagramas')
export class DiagramasController {
  constructor(
    private readonly diagramasService: DiagramasService,
    private readonly equipamentosDiagramaService: EquipamentosDiagramaService,
    private readonly conexoesDiagramaService: ConexoesDiagramaService,
  ) {}

  // ==================== ROTAS DE DIAGRAMAS ====================

  @Post()
  @ApiOperation({ summary: 'Criar novo diagrama' })
  @ApiResponse({
    status: 201,
    description: 'Diagrama criado com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Unidade não encontrada' })
  async create(@Body() createDiagramaDto: CreateDiagramaDto) {
    console.log('📝 [DiagramasController] CREATE - Recebendo request para criar diagrama');
    console.log('   📋 Body completo:', JSON.stringify(createDiagramaDto, null, 2));
    console.log('   📋 Propriedades do body:', Object.keys(createDiagramaDto));

    try {
      const diagrama = await this.diagramasService.create(createDiagramaDto);
      console.log('   ✅ Diagrama criado com ID:', diagrama.id);

      return {
        success: true,
        data: diagrama,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('   ❌ ERRO ao criar diagrama:', error);
      console.error('   📋 Mensagem:', error.message);
      console.error('   📋 Stack:', error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter diagrama por ID' })
  @ApiParam({ name: 'id', description: 'ID do diagrama' })
  @ApiQuery({
    name: 'includeData',
    required: false,
    type: Boolean,
    description: 'Incluir dados em tempo real dos equipamentos',
  })
  @ApiResponse({ status: 200, description: 'Diagrama encontrado' })
  @ApiResponse({ status: 404, description: 'Diagrama não encontrado' })
  async findOne(
    @Param('id') id: string,
    @Query('includeData') includeData?: string,
  ) {
    const includeDataBool = includeData === 'true';
    const diagrama = await this.diagramasService.findOne(id, includeDataBool);
    return {
      success: true,
      data: diagrama,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar diagrama' })
  @ApiParam({ name: 'id', description: 'ID do diagrama' })
  @ApiResponse({ status: 200, description: 'Diagrama atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'Diagrama não encontrado' })
  async update(
    @Param('id') id: string,
    @Body() updateDiagramaDto: UpdateDiagramaDto,
  ) {
    console.log('🔄 [DiagramasController] UPDATE - Recebendo request para atualizar diagrama');
    console.log('   📋 Diagrama ID:', id);
    console.log('   📋 Body completo:', JSON.stringify(updateDiagramaDto, null, 2));
    console.log('   📋 Propriedades do body:', Object.keys(updateDiagramaDto));

    const diagrama = await this.diagramasService.update(id, updateDiagramaDto);

    console.log('   ✅ Diagrama atualizado com sucesso');

    return {
      success: true,
      data: diagrama,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover diagrama (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID do diagrama' })
  @ApiResponse({ status: 200, description: 'Diagrama removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Diagrama não encontrado' })
  async remove(@Param('id') id: string) {
    const resultado = await this.diagramasService.remove(id);
    return {
      success: true,
      message: resultado.message,
      data: resultado,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ==================== ROTAS DE EQUIPAMENTOS ====================

  @Post(':diagramaId/equipamentos')
  @ApiOperation({ summary: 'Adicionar equipamento ao diagrama' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiResponse({
    status: 201,
    description: 'Equipamento adicionado com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Diagrama ou equipamento não encontrado' })
  @ApiResponse({ status: 409, description: 'Equipamento já está em outro diagrama' })
  async addEquipamento(
    @Param('diagramaId') diagramaId: string,
    @Body() dto: AddEquipamentoDiagramaDto,
  ) {
    const equipamento = await this.equipamentosDiagramaService.addEquipamento(
      diagramaId,
      dto,
    );
    return {
      success: true,
      data: equipamento,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Patch(':diagramaId/equipamentos/:equipamentoId')
  @ApiOperation({ summary: 'Atualizar posição/propriedades do equipamento no diagrama' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({
    status: 200,
    description: 'Equipamento atualizado com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado no diagrama' })
  async updateEquipamento(
    @Param('diagramaId') diagramaId: string,
    @Param('equipamentoId') equipamentoId: string,
    @Body() dto: UpdateEquipamentoDiagramaDto,
  ) {
    const equipamento = await this.equipamentosDiagramaService.updateEquipamento(
      diagramaId,
      equipamentoId,
      dto,
    );
    return {
      success: true,
      data: equipamento,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Delete(':diagramaId/equipamentos/:equipamentoId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover equipamento do diagrama' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiParam({ name: 'equipamentoId', description: 'ID do equipamento' })
  @ApiResponse({
    status: 200,
    description: 'Equipamento removido do diagrama',
  })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado no diagrama' })
  async removeEquipamento(
    @Param('diagramaId') diagramaId: string,
    @Param('equipamentoId') equipamentoId: string,
  ) {
    const resultado = await this.equipamentosDiagramaService.removeEquipamento(
      diagramaId,
      equipamentoId,
    );
    return {
      success: true,
      message: resultado.message,
      data: resultado,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post(':diagramaId/equipamentos/bulk')
  @ApiOperation({ summary: 'Adicionar múltiplos equipamentos de uma vez' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiResponse({
    status: 200,
    description: 'Equipamentos processados',
  })
  async addEquipamentosBulk(
    @Param('diagramaId') diagramaId: string,
    @Body() dto: AddEquipamentosBulkDto,
  ) {
    console.log('📦 [DiagramasController] BULK - Adicionando equipamentos em lote');
    console.log('   📋 Diagrama ID:', diagramaId);
    console.log('   📋 Quantidade de equipamentos:', dto.equipamentos?.length || 0);
    console.log('   📋 Equipamentos recebidos:', JSON.stringify(dto.equipamentos, null, 2));

    // Log detalhado das posições
    dto.equipamentos?.forEach((eq: any, idx: number) => {
      console.log(`   🎯 Equipamento [${idx + 1}]:`, {
        equipamentoId: eq.equipamentoId,
        posicao_x: eq.posicao?.x,
        posicao_y: eq.posicao?.y,
        rotacao: eq.rotacao
      });
    });

    const resultado = await this.equipamentosDiagramaService.addEquipamentosBulk(
      diagramaId,
      dto,
    );

    console.log('   ✅ Resultado do bulk:');
    console.log('      Adicionados:', resultado.adicionados);
    console.log('      Atualizados:', resultado.atualizados);
    console.log('      Erros:', resultado.erros);
    if (resultado.erros > 0) {
      console.log('      Detalhes dos erros:');
      resultado.equipamentos
        .filter((eq: any) => eq.status === 'error')
        .forEach((eq: any, idx: number) => {
          console.log(`         [${idx + 1}] ID: ${eq.equipamentoId}`);
          console.log(`             Erro: ${eq.error}`);
        });
    }

    return {
      success: true,
      data: resultado,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ==================== ROTAS DE CONEXÕES ====================

  @Post(':diagramaId/conexoes')
  @ApiOperation({ summary: 'Criar conexão entre equipamentos' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiResponse({
    status: 201,
    description: 'Conexão criada com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Equipamento não encontrado no diagrama' })
  async createConexao(
    @Param('diagramaId') diagramaId: string,
    @Body() dto: CreateConexaoDto,
  ) {
    const conexao = await this.conexoesDiagramaService.create(diagramaId, dto);
    return {
      success: true,
      data: conexao,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Patch(':diagramaId/conexoes/:conexaoId')
  @ApiOperation({ summary: 'Atualizar conexão' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiParam({ name: 'conexaoId', description: 'ID da conexão' })
  @ApiResponse({
    status: 200,
    description: 'Conexão atualizada com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Conexão não encontrada' })
  async updateConexao(
    @Param('diagramaId') diagramaId: string,
    @Param('conexaoId') conexaoId: string,
    @Body() dto: UpdateConexaoDto,
  ) {
    const conexao = await this.conexoesDiagramaService.update(
      diagramaId,
      conexaoId,
      dto,
    );
    return {
      success: true,
      data: conexao,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Delete(':diagramaId/conexoes/:conexaoId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover conexão' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiParam({ name: 'conexaoId', description: 'ID da conexão' })
  @ApiResponse({ status: 200, description: 'Conexão removida com sucesso' })
  @ApiResponse({ status: 404, description: 'Conexão não encontrada' })
  async removeConexao(
    @Param('diagramaId') diagramaId: string,
    @Param('conexaoId') conexaoId: string,
  ) {
    const resultado = await this.conexoesDiagramaService.remove(
      diagramaId,
      conexaoId,
    );
    return {
      success: true,
      message: resultado.message,
      data: resultado,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post(':diagramaId/conexoes/bulk')
  @ApiOperation({ summary: 'Criar múltiplas conexões de uma vez' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiResponse({
    status: 201,
    description: 'Conexões processadas',
  })
  async createConexoesBulk(
    @Param('diagramaId') diagramaId: string,
    @Body() dto: CreateConexoesBulkDto,
  ) {
    const resultado = await this.conexoesDiagramaService.createBulk(
      diagramaId,
      dto,
    );
    return {
      success: true,
      data: resultado,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Delete(':diagramaId/conexoes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover todas as conexões de um diagrama' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiResponse({
    status: 200,
    description: 'Todas as conexões foram removidas',
  })
  async removeAllConexoes(@Param('diagramaId') diagramaId: string) {
    console.log('🗑️ [DiagramasController] REMOVE_ALL - Removendo todas as conexões');
    console.log('   📋 Diagrama ID:', diagramaId);

    const resultado = await this.conexoesDiagramaService.removeAll(diagramaId);

    console.log('   ✅ Total removido:', resultado.totalRemovidas);

    return {
      success: true,
      message: resultado.message,
      data: resultado,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post(':diagramaId/conexoes/remove-duplicates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover conexões duplicadas do diagrama' })
  @ApiParam({ name: 'diagramaId', description: 'ID do diagrama' })
  @ApiResponse({
    status: 200,
    description: 'Conexões duplicadas removidas',
  })
  async removeDuplicateConexoes(@Param('diagramaId') diagramaId: string) {
    console.log('🧹 [DiagramasController] REMOVE_DUPLICATES - Removendo duplicatas');
    console.log('   📋 Diagrama ID:', diagramaId);

    const resultado = await this.conexoesDiagramaService.removeDuplicates(diagramaId);

    console.log('   ✅ Duplicatas removidas:', resultado.totalDuplicadas);
    console.log('   ✅ Conexões únicas mantidas:', resultado.totalUnicas);

    return {
      success: true,
      message: resultado.message,
      data: resultado,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }
}

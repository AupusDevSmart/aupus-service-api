import {
  Controller,
  Get,
  Query,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { TiposEquipamentosService } from './tipos-equipamentos.service';

@ApiTags('tipos-equipamentos')
@Controller('tipos-equipamentos')
export class TiposEquipamentosController {
  private readonly logger = new Logger(TiposEquipamentosController.name);

  constructor(private readonly tiposEquipamentosService: TiposEquipamentosService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar tipos de equipamentos',
    description: 'Retorna catálogo de tipos de equipamentos disponíveis com filtros opcionais',
  })
  @ApiQuery({
    name: 'categoria',
    required: false,
    type: String,
    description: 'Filtrar por categoria (GERACAO, DISTRIBUICAO, PROTECAO, MEDICAO, CONTROLE, etc.)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Busca por código ou nome',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de tipos de equipamentos retornada com sucesso',
  })
  async findAll(
    @Query('categoria') categoria?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log(`📋 [LIST TIPOS EQUIPAMENTOS] Buscando tipos de equipamentos`);
    this.logger.log(`📝 [LIST TIPOS EQUIPAMENTOS] Filtros - categoria: ${categoria}, search: ${search}`);

    try {
      const result = await this.tiposEquipamentosService.findAll(categoria, search);

      this.logger.log(`✅ [LIST TIPOS EQUIPAMENTOS] Encontrados ${result.data.length} tipos`);
      return result;

    } catch (error) {
      this.logger.error(`❌ [LIST TIPOS EQUIPAMENTOS] Erro:`, error.message);
      throw error;
    }
  }
}

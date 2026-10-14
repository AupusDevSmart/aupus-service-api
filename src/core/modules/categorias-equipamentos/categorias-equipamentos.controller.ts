import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CategoriasEquipamentosService } from './categorias-equipamentos.service';
import { CreateCategoriaEquipamentoDto } from './dto/create-categoria-equipamento.dto';
import { UpdateCategoriaEquipamentoDto } from './dto/update-categoria-equipamento.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('categorias-equipamentos')
@UseGuards(JwtAuthGuard)
export class CategoriasEquipamentosController {
  constructor(
    private readonly categoriasEquipamentosService: CategoriasEquipamentosService,
  ) {}

  @Post()
  @Permissions('equipamentos.manage')
  async create(@Body() createCategoriaEquipamentoDto: CreateCategoriaEquipamentoDto) {
    return this.categoriasEquipamentosService.create(
      createCategoriaEquipamentoDto,
    );
  }

  @Get()
  findAll() {
    return this.categoriasEquipamentosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriasEquipamentosService.findOne(id);
  }

  @Patch(':id')
  @Permissions('equipamentos.manage')
  update(
    @Param('id') id: string,
    @Body() updateCategoriaEquipamentoDto: UpdateCategoriaEquipamentoDto,
  ) {
    return this.categoriasEquipamentosService.update(
      id,
      updateCategoriaEquipamentoDto,
    );
  }

  @Delete(':id')
  @Permissions('equipamentos.manage')
  remove(@Param('id') id: string) {
    return this.categoriasEquipamentosService.remove(id);
  }
}

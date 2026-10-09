import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permissions } from '@/core';
import { ImportacaoService } from './importacao.service';
import { ImportarPlanilhaDto } from './dto/importar-planilha.dto';
import { UsuarioDaImportacao } from './importacao.types';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { VeiculosImportacao } from './cadastros/veiculos.importacao';
import { FeriadosImportacao } from './cadastros/feriados.importacao';

/**
 * Uma rota por cadastro, cada uma com as MESMAS permissões das rotas de criar
 * e editar daquele cadastro: quem não grava pela tela não importa.
 *
 * Ler o `.xlsx` é do navegador; validar e gravar é daqui.
 */
@ApiTags('Importação de planilha')
@Controller('importacao')
export class ImportacaoController {
  constructor(
    private readonly importacao: ImportacaoService,
    private readonly recursos: RecursosImportacao,
    private readonly veiculos: VeiculosImportacao,
    private readonly feriados: FeriadosImportacao,
  ) {}

  @Post('recursos')
  @HttpCode(HttpStatus.OK)
  @Permissions('recursos.manage', 'manutencao.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de recursos' })
  importarRecursos(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.recursos, corpo.registros, corpo.confirmar, usuario);
  }

  @Post('veiculos')
  @HttpCode(HttpStatus.OK)
  @Permissions('recursos.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de veículos' })
  importarVeiculos(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.veiculos, corpo.registros, corpo.confirmar, usuario);
  }

  @Post('feriados')
  @HttpCode(HttpStatus.OK)
  @Permissions('agenda.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de feriados' })
  importarFeriados(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.feriados, corpo.registros, corpo.confirmar, usuario);
  }
}

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permissions } from '@/core';
import { ImportacaoService } from './importacao.service';
import { ImportarPlanilhaDto } from './dto/importar-planilha.dto';
import { UsuarioDaImportacao } from './importacao.types';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { MaquinariosImportacao } from './cadastros/maquinarios.importacao';
import { VeiculosImportacao } from './cadastros/veiculos.importacao';
import { FeriadosImportacao } from './cadastros/feriados.importacao';
import { ConcessionariasImportacao } from './cadastros/concessionarias.importacao';
import { UsuariosImportacao } from './cadastros/usuarios.importacao';
import { InstrucoesImportacao } from './cadastros/instrucoes.importacao';
import { PlanosImportacao } from './cadastros/planos.importacao';
import { PlantasImportacao } from './cadastros/plantas.importacao';
import { EquipamentosImportacao } from './cadastros/equipamentos.importacao';

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
    private readonly maquinarios: MaquinariosImportacao,
    private readonly veiculos: VeiculosImportacao,
    private readonly feriados: FeriadosImportacao,
    private readonly concessionarias: ConcessionariasImportacao,
    private readonly usuarios: UsuariosImportacao,
    private readonly instrucoes: InstrucoesImportacao,
    private readonly planos: PlanosImportacao,
    private readonly plantas: PlantasImportacao,
    private readonly equipamentos: EquipamentosImportacao,
  ) {}

  @Post('recursos')
  @HttpCode(HttpStatus.OK)
  @Permissions('recursos.manage', 'manutencao.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de recursos' })
  importarRecursos(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.recursos, corpo.registros, corpo.confirmar, usuario);
  }

  // A permissão da tela de maquinários, a mesma do cadastro de recursos (SN-84)
  @Post('maquinarios')
  @HttpCode(HttpStatus.OK)
  @Permissions('recursos.manage', 'manutencao.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de maquinários' })
  importarMaquinarios(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.maquinarios, corpo.registros, corpo.confirmar, usuario);
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

  /**
   * A API de concessionárias não tem @Permissions (SN-11); a planilha exige a
   * mesma permissão que guarda a tela.
   */
  @Post('concessionarias')
  @HttpCode(HttpStatus.OK)
  @Permissions('equipamentos.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de concessionárias' })
  importarConcessionarias(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.concessionarias, corpo.registros, corpo.confirmar, usuario);
  }

  /**
   * Criar e editar usuário pedem permissões diferentes: a rota aceita
   * qualquer uma delas, e cada linha confere a sua (editar = usuarios.manage;
   * dar um tipo = usuarios.create_<tipo>).
   */
  @Post('usuarios')
  @HttpCode(HttpStatus.OK)
  @Permissions(
    'usuarios.manage',
    'usuarios.create_operador',
    'usuarios.create_proprietario',
    'usuarios.create_analista',
    'usuarios.create_admin',
  )
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de usuários' })
  importarUsuarios(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.usuarios, corpo.registros, corpo.confirmar, usuario);
  }

  @Post('instrucoes')
  @HttpCode(HttpStatus.OK)
  @Permissions('manutencao.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de instruções' })
  importarInstrucoes(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.instrucoes, corpo.registros, corpo.confirmar, usuario);
  }

  @Post('planos-manutencao')
  @HttpCode(HttpStatus.OK)
  @Permissions('manutencao.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de planos de manutenção (templates)' })
  importarPlanos(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.planos, corpo.registros, corpo.confirmar, usuario);
  }

  /** As unidades da ficha pedem também unidades.manage (conferido por linha). */
  @Post('plantas')
  @HttpCode(HttpStatus.OK)
  @Permissions('plantas.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de plantas (com as unidades)' })
  importarPlantas(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.plantas, corpo.registros, corpo.confirmar, usuario);
  }

  /** Trocar o plano pede também manutencao.manage (conferido por linha). */
  @Post('equipamentos')
  @HttpCode(HttpStatus.OK)
  @Permissions('equipamentos.manage')
  @ApiOperation({ summary: 'Prévia ou gravação da planilha de equipamentos (UC com componentes)' })
  importarEquipamentos(@Body() corpo: ImportarPlanilhaDto, @CurrentUser() usuario: UsuarioDaImportacao) {
    return this.importacao.importar(this.equipamentos, corpo.registros, corpo.confirmar, usuario);
  }
}

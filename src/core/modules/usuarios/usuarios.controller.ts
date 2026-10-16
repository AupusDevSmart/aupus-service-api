// src/modules/usuarios/usuarios.controller.ts - VERSÃO COMPLETA E CORRIGIDA
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
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extensaoDaImagem } from '@/common/helpers/extensao-da-imagem';
import { UsuariosService } from './usuarios.service';
import {
  CreateUsuarioDto,
  UpdateUsuarioDto,
  UsuarioQueryDto,
  ChangePasswordDto,
  ResetPasswordDto,
  AssignRoleDto,
  AssignPermissionDto,
  SyncPermissionsDto,
  UserPermissionsResponseDto,
  UserPermissionsSummaryDto,
  CategorizedPermissionsDto,
  BulkAssignRolesDto,
  BulkAssignPermissionsDto,
  CheckPermissionDto,
  CheckMultiplePermissionsDto,
  AtualizarPerfilDto,
} from './dto';
import { Solicitante, mesmoUsuario } from './hierarquia-de-papeis';
import { LiberadoSemTrocarSenha } from '../auth/guards/troca-de-senha.guard';
import { LIMITE_DA_TROCA_DE_SENHA, SEM_CONTADOR_DE_EMAIL } from '../auth/limite-de-tentativas';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LIMITES_DO_MULTIPART } from '@/common/upload/limites-do-upload.module';

@ApiTags('Usuários')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  // ============================================================================
  // ENDPOINTS AUXILIARES (rotas estáticas devem vir ANTES de rotas parametrizadas)
  // ============================================================================

  @Get('available/roles')
  @ApiOperation({ summary: 'Listar todos os roles disponíveis' })
  @ApiResponse({
    status: 200,
    description: 'Lista de roles disponíveis',
    schema: {
      type: 'array',
      items: { type: 'object' }
    }
  })
  getAvailableRoles() {
    return this.usuariosService.getAllAvailableRoles();
  }

  @Get('available/permissions')
  @ApiOperation({ summary: 'Listar todas as permissões disponíveis' })
  @ApiResponse({
    status: 200,
    description: 'Lista de permissões disponíveis',
    schema: {
      type: 'array',
      items: { type: 'object' }
    }
  })
  getAvailablePermissions() {
    return this.usuariosService.getAllAvailablePermissions();
  }

  @Get('available/permissions/grouped')
  @ApiOperation({ summary: 'Listar permissões disponíveis agrupadas por categoria' })
  @ApiResponse({
    status: 200,
    description: 'Permissões agrupadas por categoria',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: { type: 'object' }
      }
    }
  })
  getAvailablePermissionsGrouped() {
    return this.usuariosService.getAvailablePermissionsGrouped();
  }

  // ============================================================================
  // ENDPOINTS BÁSICOS DE USUÁRIO
  // ============================================================================

  @Get()
  @Permissions('usuarios.view')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar usuários com filtros e paginação' })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuários',
  })
  async findAll(@Query() query: UsuarioQueryDto, @CurrentUser() currentUser?: Solicitante) {
    const requestingUserId = currentUser?.id;

    return this.usuariosService.findAll(query, requestingUserId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'O próprio usuário atualiza o perfil (sem tipo, permissões nem status)' })
  @ApiResponse({ status: 200, description: 'Perfil atualizado' })
  atualizarPerfil(@Body() dto: AtualizarPerfilDto, @CurrentUser() currentUser: Solicitante) {
    return this.usuariosService.atualizarPerfil(currentUser.id, dto);
  }

  @Get(':id')
  @Permissions('usuarios.view')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário encontrado' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  @Permissions('usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista', 'usuarios.create_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Email já está em uso' })
  create(@Body() createUsuarioDto: CreateUsuarioDto, @CurrentUser() currentUser: Solicitante) {
    return this.usuariosService.create(createUsuarioDto, currentUser);
  }

  @Patch(':id')
  @Permissions('usuarios.manage')
  @ApiOperation({ summary: 'Atualizar dados do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  update(
    @Param('id') id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
    @CurrentUser() currentUser?: Solicitante,
  ) {
    return this.usuariosService.update(id, updateUsuarioDto, currentUser);
  }

  @Delete(':id')
  @Permissions('usuarios.manage')
  @ApiOperation({ summary: 'Excluir usuário (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário excluído com sucesso' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  remove(@Param('id') id: string, @CurrentUser() currentUser?: Solicitante) {
    return this.usuariosService.remove(id, currentUser);
  }

  // ============================================================================
  // ENDPOINTS DE GESTÃO DE SENHA
  // ============================================================================

  @Patch(':id/change-password')
  @LiberadoSemTrocarSenha()
  @UseGuards(ThrottlerGuard)
  @Throttle(LIMITE_DA_TROCA_DE_SENHA)
  @SkipThrottle(SEM_CONTADOR_DE_EMAIL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alterar senha do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Senha alterada com sucesso' })
  changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() currentUser: Solicitante,
  ) {
    return this.usuariosService.changePassword(id, changePasswordDto, currentUser);
  }

  @Patch(':id/reset-password')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resetar senha do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Senha resetada com sucesso' })
  resetPassword(
    @Param('id') id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
    @CurrentUser() currentUser: Solicitante,
  ) {
    return this.usuariosService.resetPassword(id, resetPasswordDto, currentUser);
  }

  @Post(':id/upload-avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload de foto de perfil do usuário' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Avatar atualizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Arquivo inválido' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extensaoDaImagem(file.mimetype);
          callback(null, `avatar-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          return callback(new Error('Apenas imagens são permitidas!'), false);
        }
        callback(null, true);
      },
      limits: {
        ...LIMITES_DO_MULTIPART,
        fileSize: 2 * 1024 * 1024, // 2MB
      },
    }),
  )
  uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: Solicitante,
  ) {
    return this.usuariosService.updateAvatar(id, file.filename, currentUser);
  }

  // ============================================================================
  // ENDPOINTS DE GESTÃO DE ROLES E PERMISSIONS
  // ============================================================================

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Buscar todas as permissões de um usuário (role + diretas)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Permissões do usuário encontradas',
    type: UserPermissionsResponseDto
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  getUserPermissions(@Param('id') id: string, @CurrentUser() currentUser: Solicitante) {
    this.exigirProprioOuVer(currentUser, id);
    return this.usuariosService.getUserPermissions(id);
  }

  @Get(':id/permissions/detailed')
  @ApiOperation({ summary: 'Buscar permissões detalhadas do usuário com informações extras' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Permissões detalhadas encontradas', 
    type: UserPermissionsResponseDto 
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  getUserPermissionsDetailed(@Param('id') id: string, @CurrentUser() currentUser: Solicitante) {
    this.exigirProprioOuVer(currentUser, id);
    return this.usuariosService.getUserPermissionsDetailed(id);
  }

  @Get(':id/permissions/summary')
  @ApiOperation({ summary: 'Buscar resumo das permissões do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Resumo das permissões', 
    type: UserPermissionsSummaryDto 
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  getUserPermissionsSummary(@Param('id') id: string, @CurrentUser() currentUser: Solicitante) {
    this.exigirProprioOuVer(currentUser, id);
    return this.usuariosService.getUserPermissionsSummary(id);
  }

  @Get(':id/permissions/categorized')
  @ApiOperation({ summary: 'Buscar permissões categorizadas do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Permissões categorizadas', 
    type: CategorizedPermissionsDto 
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  getUserPermissionsCategorized(@Param('id') id: string, @CurrentUser() currentUser: Solicitante) {
    this.exigirProprioOuVer(currentUser, id);
    return this.usuariosService.getUserPermissionsCategorized(id);
  }

  @Post(':id/check-permission')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar se usuário tem uma permissão específica' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado da verificação',
    schema: {
      type: 'object',
      properties: {
        hasPermission: { type: 'boolean' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  checkUserPermission(
    @Param('id') id: string,
    @Body() checkPermissionDto: CheckPermissionDto,
    @CurrentUser() currentUser: Solicitante,
  ) {
    this.exigirProprioOuVer(currentUser, id);
    return this.usuariosService.checkUserPermission(id, checkPermissionDto.permissionName);
  }

  @Post(':id/check-permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar múltiplas permissões do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado da verificação múltipla',
    schema: {
      type: 'object',
      properties: {
        hasPermissions: { type: 'boolean' },
        details: { 
          type: 'object',
          additionalProperties: { type: 'boolean' }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  checkUserPermissions(
    @Param('id') id: string,
    @Body() checkMultipleDto: CheckMultiplePermissionsDto,
    @CurrentUser() currentUser: Solicitante,
  ) {
    this.exigirProprioOuVer(currentUser, id);
    return this.usuariosService.checkUserPermissions(
      id, 
      checkMultipleDto.permissionNames, 
      checkMultipleDto.mode
    );
  }

  @Post(':id/assign-role')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir role a um usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Role atribuído com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        role: { type: 'object' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Usuário ou role não encontrado' })
  assignRole(
    @Param('id') id: string,
    @Body() assignRoleDto: AssignRoleDto,
    @CurrentUser() currentUser: Solicitante,
  ) {
    return this.usuariosService.atribuirPapel(id, assignRoleDto.roleId, currentUser);
  }

  @Post(':id/assign-permission')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir permissão direta a um usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Permissão atribuída com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        permission: { type: 'object' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Usuário ou permissão não encontrada' })
  @ApiResponse({ status: 409, description: 'Usuário já possui esta permissão' })
  assignPermission(
    @Param('id') id: string,
    @Body() assignPermissionDto: AssignPermissionDto,
    @CurrentUser() currentUser: Solicitante,
  ) {
    return this.usuariosService.atribuirPermissao(id, assignPermissionDto.permissionId, currentUser);
  }

  @Delete(':id/remove-permission/:permissionId')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover permissão direta de um usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiParam({ name: 'permissionId', description: 'ID da permissão' })
  @ApiResponse({ 
    status: 200, 
    description: 'Permissão removida com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Usuário, permissão não encontrada ou usuário não possui a permissão' })
  removePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() currentUser: Solicitante,
  ) {
    return this.usuariosService.removerPermissao(id, parseInt(permissionId), currentUser);
  }

  @Post(':id/sync-permissions')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar permissões diretas de um usuário (sobrescreve todas)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ 
    status: 200, 
    description: 'Permissões sincronizadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        permissions: { 
          type: 'array',
          items: { type: 'object' }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  @ApiResponse({ status: 400, description: 'Uma ou mais permissões não existem' })
  syncUserPermissions(
    @Param('id') id: string,
    @Body() syncPermissionsDto: SyncPermissionsDto,
    @CurrentUser() currentUser: Solicitante,
  ) {
    return this.usuariosService.sincronizarPermissoesDiretas(id, syncPermissionsDto.permissionIds, currentUser);
  }

  // ============================================================================
  // ENDPOINTS DE OPERAÇÕES EM LOTE
  // ============================================================================

  @Post('bulk/assign-roles')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir roles para múltiplos usuários' })
  @ApiResponse({ 
    status: 200, 
    description: 'Operação em lote concluída',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'number' },
        failures: { 
          type: 'array',
          items: { type: 'object' }
        }
      }
    }
  })
  bulkAssignRoles(@Body() bulkData: BulkAssignRolesDto, @CurrentUser() currentUser: Solicitante) {
    return this.usuariosService.bulkAssignRoles(bulkData, currentUser);
  }

  @Post('bulk/assign-permissions')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar permissões para múltiplos usuários' })
  @ApiResponse({ 
    status: 200, 
    description: 'Operação em lote concluída',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'number' },
        failures: { 
          type: 'array',
          items: { type: 'object' }
        }
      }
    }
  })
  bulkAssignPermissions(@Body() bulkData: BulkAssignPermissionsDto, @CurrentUser() currentUser: Solicitante) {
    return this.usuariosService.bulkAssignPermissions(bulkData, currentUser);
  }

  @Post('sync/legacy-roles')
  @Permissions('usuarios.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sincronizar roles legacy com sistema Spatie',
    description: 'Migra usuários que têm role na coluna mas não no sistema Spatie. Use apenas quando necessário.'
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronização concluída',
    schema: {
      type: 'object',
      properties: {
        migrated: { type: 'number' },
        errors: {
          type: 'array',
          items: { type: 'object' }
        }
      }
    }
  })
  syncLegacyRoles(@CurrentUser() currentUser: Solicitante) {
    // A coluna legada pode trazer qualquer papel (até super_admin): só o topo migra.
    if (currentUser.role !== 'super_admin') {
      throw new ForbiddenException('Só super_admin migra os papéis legados.');
    }
    return this.usuariosService.syncLegacyRolesToSpatie();
  }

  /** As permissões de alguém: o próprio, ou quem pode ver usuários. */
  private exigirProprioOuVer(currentUser: Solicitante, id: string) {
    if (mesmoUsuario(currentUser.id, id) || currentUser.permissions.includes('usuarios.view')) return;
    throw new ForbiddenException('Você não pode ver as permissões de outro usuário.');
  }
}

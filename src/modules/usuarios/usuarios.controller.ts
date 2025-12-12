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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
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
  CheckMultiplePermissionsDto
} from './dto';

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

  @Get('debug/constraint-values')
  @ApiOperation({ summary: 'Descobrir valores válidos do constraint role' })
  @ApiResponse({
    status: 200,
    description: 'Valores válidos do constraint role',
    schema: {
      type: 'object',
      properties: {
        validValues: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  })
  async getValidRoleConstraintValues() {
    const validValues = await this.usuariosService.getValidRoleConstraintValues();
    return { validValues };
  }

  @Get('debug/user-permissions/:userId')
  @ApiOperation({
    summary: 'Debug - Verificar estado das permissões do usuário',
    description: 'Endpoint para debugging - mostra dados brutos de roles e permissions'
  })
  @ApiParam({ name: 'userId', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Dados de debug das permissões'
  })
  debugUserPermissionsNew(@Param('userId') userId: string) {
    return this.usuariosService.debugUserPermissions(userId);
  }

  @Get('debug-permissions/:id')
  @ApiOperation({
    summary: 'Debug - Verificar estado das permissões do usuário',
    description: 'Endpoint para debugging - mostra dados brutos de roles e permissions'
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Dados de debug das permissões',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        basicData: { type: 'object' },
        spatieData: { type: 'object' },
        processedResult: { type: 'object' },
        counts: { type: 'object' }
      }
    }
  })
  debugUserPermissions(@Param('id') id: string) {
    return this.usuariosService.debugUserPermissions(id);
  }

  // ============================================================================
  // ENDPOINTS BÁSICOS DE USUÁRIO
  // ============================================================================

  @Get()
  @ApiOperation({ summary: 'Listar usuários com filtros e paginação' })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuários',
  })
  findAll(@Query() query: UsuarioQueryDto) {
    return this.usuariosService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário encontrado' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Email já está em uso' })
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  update(
    @Param('id') id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
  ) {
    return this.usuariosService.update(id, updateUsuarioDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir usuário (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário excluído com sucesso' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  remove(@Param('id') id: string) {
    return this.usuariosService.remove(id);
  }

  // ============================================================================
  // ENDPOINTS DE GESTÃO DE SENHA
  // ============================================================================

  @Patch(':id/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alterar senha do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Senha alterada com sucesso' })
  changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usuariosService.changePassword(id, changePasswordDto);
  }

  @Patch(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resetar senha do usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Senha resetada com sucesso' })
  resetPassword(
    @Param('id') id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.usuariosService.resetPassword(id, resetPasswordDto);
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
          const ext = extname(file.originalname);
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
        fileSize: 2 * 1024 * 1024, // 2MB
      },
    }),
  )
  uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usuariosService.updateAvatar(id, file.filename);
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
  getUserPermissions(@Param('id') id: string) {
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
  getUserPermissionsDetailed(@Param('id') id: string) {
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
  getUserPermissionsSummary(@Param('id') id: string) {
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
  getUserPermissionsCategorized(@Param('id') id: string) {
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
  ) {
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
  ) {
    return this.usuariosService.checkUserPermissions(
      id, 
      checkMultipleDto.permissionNames, 
      checkMultipleDto.mode
    );
  }

  @Post(':id/assign-role')
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
  ) {
    return this.usuariosService.assignRole(id, assignRoleDto.roleId);
  }

  @Post(':id/assign-permission')
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
  ) {
    return this.usuariosService.assignPermission(id, assignPermissionDto.permissionId);
  }

  @Delete(':id/remove-permission/:permissionId')
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
  ) {
    return this.usuariosService.removePermission(id, parseInt(permissionId));
  }

  @Post(':id/sync-permissions')
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
  ) {
    return this.usuariosService.syncUserPermissions(id, syncPermissionsDto.permissionIds);
  }

  // ============================================================================
  // ENDPOINTS DE OPERAÇÕES EM LOTE
  // ============================================================================

  @Post('bulk/assign-roles')
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
  bulkAssignRoles(@Body() bulkData: BulkAssignRolesDto) {
    return this.usuariosService.bulkAssignRoles(bulkData);
  }

  @Post('bulk/assign-permissions')
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
  bulkAssignPermissions(@Body() bulkData: BulkAssignPermissionsDto) {
    return this.usuariosService.bulkAssignPermissions(bulkData);
  }

  @Post('sync/legacy-roles')
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
  syncLegacyRoles() {
    return this.usuariosService.syncLegacyRolesToSpatie();
  }

  // ============================================================================
  // ENDPOINT DE TESTE (pode remover em produção)
  // ============================================================================

  @Post('test-simple')
  @ApiOperation({ summary: 'Endpoint de teste simples' })
  @ApiResponse({
    status: 200,
    description: 'Teste realizado com sucesso'
  })
  testSimple(@Body() body: any) {
    console.log('🔥 TESTE SIMPLES - Chegou no controller!');
    console.log('📝 Body recebido:', body);
    return { success: true, message: 'Controller funcionando!', data: body };
  }
}
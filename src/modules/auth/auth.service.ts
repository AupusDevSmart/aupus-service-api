import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../usuarios/usuarios.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

/**
 * Serviço de autenticação
 * Responsável por gerenciar login, validação de credenciais e geração de tokens JWT
 */
@Injectable()
export class AuthService {
  constructor(
    private usuariosService: UsuariosService,
    private jwtService: JwtService,
  ) {}

  /**
   * Valida as credenciais do usuário
   * @param email Email do usuário
   * @param senha Senha em texto plano
   * @returns Dados do usuário (sem senha) se válido
   * @throws UnauthorizedException se credenciais inválidas
   * @throws ForbiddenException se usuário inativo
   */
  async validateUser(email: string, senha: string): Promise<any> {
    console.log(`🔐 [AUTH] Validando credenciais para: ${email}`);

    // Buscar usuário por email
    const usuario = await this.usuariosService.findByEmail(email);

    if (!usuario) {
      console.log(`❌ [AUTH] Usuário não encontrado: ${email}`);
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Verificar se o usuário está ativo
    if (usuario.status !== 'Ativo' || !usuario.is_active || usuario.deleted_at) {
      console.log(`🚫 [AUTH] Usuário inativo: ${email}`);
      throw new ForbiddenException(
        'Usuário inativo. Entre em contato com o administrador.',
      );
    }

    // Verificar se o usuário tem senha definida
    if (!usuario.senha) {
      console.log(`⚠️ [AUTH] Usuário sem senha definida: ${email}`);
      throw new BadRequestException(
        'Usuário não possui senha definida. Entre em contato com o administrador.',
      );
    }

    // Verificar a senha
    const senhaValida = await bcrypt.compare(senha, usuario.senha);

    if (!senhaValida) {
      console.log(`❌ [AUTH] Senha inválida para: ${email}`);
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    console.log(`✅ [AUTH] Credenciais válidas para: ${email}`);

    // Remove senha do objeto antes de retornar
    const { senha: _, ...result } = usuario;
    return result;
  }

  /**
   * Realiza login e retorna tokens JWT
   * @param loginDto Credenciais de login
   * @returns Tokens de acesso e dados do usuário
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    console.log(`🚀 [AUTH] Iniciando login para: ${loginDto.email}`);

    // Validar credenciais
    const usuario = await this.validateUser(loginDto.email, loginDto.senha);

    // Buscar permissões completas do usuário
    const permissoes = await this.usuariosService
      .getUserPermissions(usuario.id)
      .catch((error) => {
        console.error(
          `⚠️ [AUTH] Erro ao buscar permissões do usuário ${usuario.id}:`,
          error,
        );
        return {
          role: null,
          permissions: [],
          permissionNames: [],
        };
      });

    // Payload do JWT
    const payload = {
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: permissoes.role?.name || null,
      permissions: permissoes.permissionNames || [],
    };

    console.log(`🔑 [AUTH] Gerando tokens para usuário: ${usuario.id}`);

    // Gerar access token (1 hora)
    const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });

    // Gerar refresh token (7 dias)
    const refresh_token = this.jwtService.sign(
      { sub: usuario.id, type: 'refresh' },
      { expiresIn: '7d' },
    );

    console.log(`✅ [AUTH] Login bem-sucedido para: ${loginDto.email}`);

    // Buscar dados completos do usuário para retornar
    const usuarioCompleto = await this.usuariosService
      .findOne(usuario.id)
      .catch((error) => {
        console.error(
          `⚠️ [AUTH] Erro ao buscar dados completos do usuário:`,
          error,
        );
        // Fallback com dados básicos
        return {
          ...usuario,
          all_permissions: permissoes.permissions || [],
          role_details: permissoes.role || null,
        };
      });

    console.log(`📦 [AUTH] Dados do usuário para retornar:`, {
      id: usuarioCompleto.id,
      nome: usuarioCompleto.nome,
      email: usuarioCompleto.email,
      has_all_permissions: !!usuarioCompleto.all_permissions,
      permissions_count: usuarioCompleto.all_permissions?.length || 0,
    });

    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hora em segundos
      user: usuarioCompleto as any,
    };
  }

  /**
   * Renova o access token usando refresh token
   * @param refreshToken Refresh token JWT
   * @returns Novos access e refresh tokens
   * @throws UnauthorizedException se token inválido
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string; token_type: string; expires_in: number }> {
    console.log(`🔄 [AUTH] Renovando token...`);

    try {
      // Verificar e decodificar o refresh token
      const payload = this.jwtService.verify(refreshToken);

      // Validar que é realmente um refresh token
      if (payload.type !== 'refresh') {
        console.log(`❌ [AUTH] Token fornecido não é um refresh token`);
        throw new UnauthorizedException('Token inválido');
      }

      // Buscar usuário
      const usuario = await this.usuariosService
        .findOne(payload.sub)
        .catch(() => null);

      if (!usuario) {
        console.log(`❌ [AUTH] Usuário não encontrado para token: ${payload.sub}`);
        throw new UnauthorizedException('Usuário não encontrado');
      }

      // Verificar se usuário está ativo
      if (usuario.status !== 'Ativo') {
        console.log(`🚫 [AUTH] Usuário inativo no refresh: ${payload.sub}`);
        throw new UnauthorizedException('Usuário inativo ou inválido');
      }

      // Buscar permissões atualizadas
      const permissoes = await this.usuariosService
        .getUserPermissions(usuario.id)
        .catch((error) => {
          console.error(`⚠️ [AUTH] Erro ao buscar permissões:`, error);
          return {
            role: null,
            permissions: [],
            permissionNames: [],
          };
        });

      // Criar novo payload com dados atualizados
      const newPayload = {
        sub: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        role: permissoes.role?.name || null,
        permissions: permissoes.permissionNames || [],
      };

      // Gerar novos tokens
      const access_token = this.jwtService.sign(newPayload, {
        expiresIn: '1h',
      });

      const refresh_token = this.jwtService.sign(
        { sub: usuario.id, type: 'refresh' },
        { expiresIn: '7d' },
      );

      console.log(`✅ [AUTH] Token renovado com sucesso para: ${usuario.id}`);

      return {
        access_token,
        refresh_token,
        token_type: 'Bearer',
        expires_in: 3600,
      };
    } catch (error) {
      console.error(`❌ [AUTH] Erro ao renovar token:`, error.message);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  /**
   * Retorna dados do usuário atual autenticado
   * @param userId ID do usuário extraído do token
   * @returns Dados completos do usuário
   */
  async getCurrentUser(userId: string) {
    console.log(`👤 [AUTH] Buscando dados do usuário: ${userId}`);

    const usuario = await this.usuariosService.findOne(userId).catch(() => null);

    if (!usuario) {
      console.log(`❌ [AUTH] Usuário não encontrado: ${userId}`);
      throw new UnauthorizedException('Usuário não encontrado');
    }

    console.log(`✅ [AUTH] Dados do usuário retornados: ${userId}`);

    return usuario;
  }

  /**
   * Realiza logout (pode ser expandido para blacklist de tokens)
   * @param userId ID do usuário
   */
  async logout(userId: string): Promise<{ message: string }> {
    console.log(`👋 [AUTH] Logout do usuário: ${userId}`);

    // TODO: Implementar blacklist de tokens se necessário
    // Por enquanto, o logout é gerenciado pelo frontend removendo o token

    return { message: 'Logout realizado com sucesso' };
  }
}

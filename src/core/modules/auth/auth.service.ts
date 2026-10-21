import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordWithTokenDto } from './dto/reset-password.dto';
import type { usuarios } from '@prisma/client';
import type { UsuarioResponseDto } from '../usuarios/dto/usuario-response.dto';
import type { UserRoleDto } from '../usuarios/dto/user-permissions-response.dto';

/** Validade do link de redefinição de senha, em minutos. */
const RESET_TOKEN_EXP_MINUTES = 60;

/**
 * Hash de uma senha que ninguém sabe, com o mesmo custo das senhas de verdade
 * (12): o login de e-mail que não existe compara contra ele e demora o mesmo.
 * Gerado uma vez, na primeira vez que precisa.
 */
let hashFalso: Promise<string> | undefined;
const hashParaComparar = () => (hashFalso ??= bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12));

/** A linha do usuário sem a senha — o que `validateUser` devolve. */
type UsuarioSemSenha = Omit<usuarios, 'senha'>;

/**
 * O `user` do login. Vem do `findOne` (ou, se ele falhar, da linha do banco),
 * com o papel pelo nome, as permissões pelo NOME em `all_permissions` — e não
 * os objetos do `UsuarioResponseDto`; o store do front normaliza as duas
 * formas — e as plantas que ele acessa.
 */
export type UsuarioDoLogin = Omit<UsuarioResponseDto | UsuarioSemSenha, 'role' | 'role_details' | 'all_permissions'> & {
  role: string | null;
  role_details: UserRoleDto | null;
  all_permissions: string[];
  plantas_vinculadas: string[];
};

/** A resposta do login: o `AuthResponseDto`, com o `user` na forma acima. */
export type RespostaDoLogin = Omit<AuthResponseDto, 'user'> & { user: UsuarioDoLogin };

/**
 * Serviço de autenticação
 * Responsável por gerenciar login, validação de credenciais e geração de tokens JWT
 */
@Injectable()
export class AuthService {
  constructor(
    private usuariosService: UsuariosService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  /**
   * Valida as credenciais do usuário
   * @param email Email do usuário
   * @param senha Senha em texto plano
   * @returns Dados do usuário (sem senha) se válido
   * @throws UnauthorizedException se credenciais inválidas
   * @throws ForbiddenException se usuário inativo
   */
  async validateUser(email: string, senha: string): Promise<UsuarioSemSenha> {

    // Buscar usuário por email
    const usuario = await this.usuariosService.findByEmail(email);

    // A senha é conferida antes de tudo e sempre passa pelo bcrypt, com o mesmo
    // 401 para e-mail que não existe, conta sem senha e senha errada. Antes,
    // inativa (403) e sem senha (400) respondiam antes da senha e o e-mail que
    // não existe respondia sem o bcrypt: a mensagem e o tempo contavam quem
    // tem conta (SN-38).
    const senhaValida = await bcrypt.compare(senha, usuario?.senha || (await hashParaComparar()));
    if (!usuario || !usuario.senha || !senhaValida) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Só quem acertou a senha fica sabendo que a conta está inativa
    if (usuario.status !== 'Ativo' || !usuario.is_active || usuario.deleted_at) {
      throw new ForbiddenException(
        'Usuário inativo. Entre em contato com o administrador.',
      );
    }


    // Remove senha do objeto antes de retornar
    const { senha: _, ...result } = usuario;
    return result;
  }

  /**
   * Realiza login e retorna tokens JWT
   * @param loginDto Credenciais de login
   * @returns Tokens de acesso e dados do usuário
   */
  async login(loginDto: LoginDto): Promise<RespostaDoLogin> {

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


    // Gerar access token (1 hora)
    const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });

    // Gerar refresh token (7 dias)
    const refresh_token = this.jwtService.sign(
      { sub: usuario.id, type: 'refresh' },
      { expiresIn: '7d' },
    );


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

    // Anexar role + permissoes + plantas para o frontend (PermissionsContext)
    const plantas_vinculadas = await this.getPlantasAcessiveis(usuario.id, permissoes.role?.name);
    const usuarioDoLogin: UsuarioDoLogin = Object.assign(usuarioCompleto, {
      role: permissoes.role?.name ?? null,
      role_details: permissoes.role,
      all_permissions: permissoes.permissionNames,
      plantas_vinculadas,
    });


    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hora em segundos
      user: usuarioDoLogin,
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

    try {
      // Verificar e decodificar o refresh token
      const payload = this.jwtService.verify(refreshToken);

      // Validar que é realmente um refresh token
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token inválido');
      }

      // Buscar usuário
      const usuario = await this.usuariosService
        .findOne(payload.sub)
        .catch(() => null);

      if (!usuario) {
        throw new UnauthorizedException('Usuário não encontrado');
      }

      // Verificar se usuário está ativo
      if (usuario.status !== 'Ativo') {
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
   * Retorna dados do usuário atual autenticado, com role, permissoes e plantas vinculadas.
   * Usado pelo frontend para carregar o PermissionsContext no login/refresh.
   */
  async getCurrentUser(userId: string) {
    // Só o "não existe" vira 401: uma queda do banco virava "Usuário não encontrado" calado
    const usuario = await this.usuariosService.findOne(userId).catch((erro: unknown) => {
      if (erro instanceof NotFoundException) return null;
      throw erro;
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    // Buscar role + permissoes (via role + diretas)
    const permissoes = await this.usuariosService
      .getUserPermissions(userId)
      .catch((error) => {
        console.error(`⚠️ [AUTH] Erro ao buscar permissoes do usuario ${userId}:`, error);
        return { role: null, permissions: [], permissionNames: [] };
      });

    // Buscar plantas que o usuario pode acessar (filtro de dados)
    // - operador: plantas vinculadas via planta_operadores
    // - proprietario: plantas onde ele e proprietario_id
    // - demais roles: [] (sem filtro, backend nao restringe)
    const plantas_vinculadas = await this.getPlantasAcessiveis(userId, permissoes.role?.name);


    return {
      ...usuario,
      role: permissoes.role?.name ?? null,
      role_details: permissoes.role,
      all_permissions: permissoes.permissionNames,
      plantas_vinculadas,
    };
  }

  /**
   * Retorna os ids das plantas que o usuario pode acessar (para data-scoping).
   * Roles analista+ retornam array vazio (sem filtro).
   */
  private async getPlantasAcessiveis(userId: string, roleName: string | null | undefined): Promise<string[]> {
    if (roleName === 'operador') {
      const vinculos = await this.prisma.planta_operadores.findMany({
        where: { usuario_id: userId },
        select: { planta_id: true },
      });
      return vinculos.map((v) => v.planta_id);
    }

    if (roleName === 'proprietario') {
      const plantas = await this.prisma.plantas.findMany({
        where: { proprietario_id: userId, deleted_at: null },
        select: { id: true },
      });
      return plantas.map((p) => p.id);
    }

    return [];
  }

  /**
   * Solicita a redefinição de senha.
   * Sempre retorna a mesma mensagem (anti-enumeração). Se o usuário existir e estiver ativo,
   * gera um token aleatório, guarda apenas o hash em password_reset_tokens e envia o email.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const mensagemGenerica = {
      message: 'Se o email estiver cadastrado, enviaremos as instruções de redefinição.',
    };

    const email = dto.email.trim();
    // O inexistente já volta nulo; a falha do banco não vira "enviamos" calado (o e-mail nunca chegaria)
    const usuario = await this.usuariosService.findByEmail(email);

    // Não revela se o email existe; só envia para contas ativas.
    if (!usuario || usuario.status !== 'Ativo' || !usuario.is_active || usuario.deleted_at) {
      return mensagemGenerica;
    }

    // Token bruto vai no link; no banco fica apenas o hash.
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 10);

    await this.prisma.password_reset_tokens.upsert({
      where: { email: usuario.email },
      create: { email: usuario.email, token: tokenHash, created_at: new Date() },
      update: { token: tokenHash, created_at: new Date() },
    });

    // Fire-and-forget: não bloqueia a resposta nem vaza falha de SMTP para o usuário.
    this.mailService
      .sendPasswordResetEmail(
        usuario.email,
        usuario.nome,
        token,
        usuario.email,
        RESET_TOKEN_EXP_MINUTES,
      )
      .catch((err) =>
        console.error(`⚠️ [AUTH] Erro ao enviar email de redefinição: ${err.message}`),
      );

    return mensagemGenerica;
  }

  /**
   * Conclui a redefinição de senha usando o token enviado por email.
   * Valida existência, expiração (60 min), correspondência do hash e igualdade das senhas.
   */
  async resetPassword(dto: ResetPasswordWithTokenDto): Promise<{ message: string }> {
    if (dto.novaSenha !== dto.confirmarSenha) {
      throw new BadRequestException('As senhas não conferem');
    }

    // Resolve o usuário primeiro para usar o email canônico do banco como chave em
    // todas as queries (token + update), evitando divergência por caixa/espacos.
    const usuario = await this.usuariosService
      .findByEmail(dto.email.trim())
      .catch(() => null);

    // A mesma regra do "esqueci": conta excluída ou inativa não troca a senha,
    // nem com um token emitido enquanto estava ativa (revisão do SN-46)
    if (!usuario || usuario.status !== 'Ativo' || !usuario.is_active || usuario.deleted_at) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const email = usuario.email;

    const registro = await this.prisma.password_reset_tokens.findUnique({
      where: { email },
    });

    if (!registro) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    // Verifica expiração com base no created_at.
    const criadoEm = registro.created_at ? new Date(registro.created_at).getTime() : 0;
    const expirado = Date.now() - criadoEm > RESET_TOKEN_EXP_MINUTES * 60 * 1000;

    if (expirado) {
      await this.prisma.password_reset_tokens.delete({ where: { email } }).catch(() => null);
      throw new BadRequestException('Token inválido ou expirado');
    }

    const tokenValido = await bcrypt.compare(dto.token, registro.token);
    if (!tokenValido) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    // Atualiza a senha e invalida o token (uso único).
    const novaSenhaHash = await bcrypt.hash(dto.novaSenha, 12);
    await this.prisma.usuarios.update({
      where: { email },
      data: { senha: novaSenhaHash, updated_at: new Date() },
    });
    await this.prisma.password_reset_tokens.delete({ where: { email } }).catch(() => null);

    return { message: 'Senha redefinida com sucesso' };
  }

  /**
   * Realiza logout (pode ser expandido para blacklist de tokens)
   * @param userId ID do usuário
   */
  async logout(_userId: string): Promise<{ message: string }> {

    // TODO: Implementar blacklist de tokens se necessário
    // Por enquanto, o logout é gerenciado pelo frontend removendo o token

    return { message: 'Logout realizado com sucesso' };
  }
}

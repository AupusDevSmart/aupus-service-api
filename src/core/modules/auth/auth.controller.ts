import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { LiberadoSemTrocarSenha } from './guards/troca-de-senha.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService, RespostaDoLogin } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordWithTokenDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LIMITE_DA_REDEFINICAO, LIMITE_DO_ESQUECI_A_SENHA, LIMITE_DO_LOGIN, SEM_CONTADOR_DE_EMAIL } from './limite-de-tentativas';
import type { UsuarioAutenticado } from './strategies/jwt.strategy';

/**
 * Controller de autenticação
 * Gerencia endpoints de login, logout, refresh token e perfil do usuário
 */
@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Endpoint de login
   * Retorna access_token, refresh_token e dados do usuário
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(LIMITE_DO_LOGIN)
  @SkipThrottle(SEM_CONTADOR_DE_EMAIL)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Realiza login e retorna JWT' })
  @ApiResponse({
    status: 200,
    description: 'Login realizado com sucesso',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  @ApiResponse({ status: 403, description: 'Usuário inativo' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas (SN-38)' })
  async login(@Body() loginDto: LoginDto): Promise<RespostaDoLogin> {
    return this.authService.login(loginDto);
  }

  /**
   * Endpoint de refresh token
   * Renova o access_token usando o refresh_token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova o access token' })
  @ApiResponse({ status: 200, description: 'Token renovado com sucesso' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }

  /**
   * Solicita a redefinição de senha.
   * Sempre retorna sucesso genérico para não revelar se o email existe (anti-enumeração).
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(LIMITE_DO_ESQUECI_A_SENHA)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicita redefinição de senha por email' })
  @ApiResponse({ status: 200, description: 'Solicitação processada' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  /**
   * Conclui a redefinição de senha usando o token recebido por email.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(LIMITE_DA_REDEFINICAO)
  @SkipThrottle(SEM_CONTADOR_DE_EMAIL)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redefine a senha usando token do email' })
  @ApiResponse({ status: 200, description: 'Senha redefinida com sucesso' })
  @ApiResponse({ status: 400, description: 'Token inválido ou expirado' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordWithTokenDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  /**
   * Endpoint de logout
   * Remove a sessão do usuário (futuramente pode invalidar token)
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @LiberadoSemTrocarSenha()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Realiza logout' })
  @ApiResponse({ status: 200, description: 'Logout realizado com sucesso' })
  async logout(@CurrentUser() user: UsuarioAutenticado) {
    return this.authService.logout(user.id);
  }

  /**
   * Endpoint para buscar dados do usuário autenticado
   * Retorna informações completas do perfil
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @LiberadoSemTrocarSenha()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retorna dados do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Dados do usuário' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  async getProfile(@CurrentUser() user: UsuarioAutenticado) {
    return this.authService.getCurrentUser(user.id);
  }
}

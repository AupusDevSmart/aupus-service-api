import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '@/core';
import { LIMITE_DOS_CHAMADOS_DO_NEXON, SO_O_IP } from '@/core/modules/auth/limite-de-tentativas';
import { ChamadoNexonDto } from './dto/chamado-nexon.dto';
import { ChamadosNexonService } from './chamados-nexon.service';
import { TokenNexonGuard } from './token-nexon.guard';

/**
 * Recepcao dos chamados do NexON: SO o backend do NexON fala aqui.
 *
 * `@Public()` tira o JWT de usuario do caminho; quem autentica e o
 * `TokenNexonGuard` (Bearer de servico). Fora do Swagger: contrato interno,
 * documentado em aupus-nexon-api/docs/CHAMADOS.md.
 */
@ApiExcludeController()
@Public()
@Controller('integracoes/nexon')
// O limite antes do token: tentativa com token errado também conta
@UseGuards(ThrottlerGuard, TokenNexonGuard)
@Throttle(LIMITE_DOS_CHAMADOS_DO_NEXON)
@SkipThrottle(SO_O_IP)
export class ChamadosNexonController {
  constructor(private readonly service: ChamadosNexonService) {}

  /**
   * 200 quando a solicitacao existe — criada agora ou numa entrega anterior, ainda
   * aberta. 409 quando a do chamado ja foi finalizada ou excluida (reencaminhamento).
   */
  @Post('chamados')
  @HttpCode(HttpStatus.OK)
  receber(@Body() dto: ChamadoNexonDto, @Req() req: Request) {
    // O req.ip, que o trust proxy resolve (o X-Forwarded-For cru vem de quem pede)
    return this.service.receber(dto, { ip: req.ip ?? null, user_agent: req.headers['user-agent'] ?? null });
  }
}

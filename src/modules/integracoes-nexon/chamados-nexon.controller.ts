import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@/core';
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
@UseGuards(TokenNexonGuard)
export class ChamadosNexonController {
  constructor(private readonly service: ChamadosNexonService) {}

  /** 200 sempre que a solicitacao existe — criada agora ou numa entrega anterior. */
  @Post('chamados')
  @HttpCode(HttpStatus.OK)
  receber(@Body() dto: ChamadoNexonDto, @Req() req: any) {
    const ip = (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null;
    return this.service.receber(dto, { ip, user_agent: req.headers?.['user-agent'] ?? null });
  }
}

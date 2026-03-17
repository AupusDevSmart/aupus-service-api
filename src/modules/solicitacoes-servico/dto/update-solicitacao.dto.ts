import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSolicitacaoDto } from './create-solicitacao.dto';

export class UpdateSolicitacaoDto extends PartialType(
  OmitType(CreateSolicitacaoDto, ['status'] as const)
) {}
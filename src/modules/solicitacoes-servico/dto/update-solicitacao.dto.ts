import { PartialType } from '@nestjs/swagger';
import { CreateSolicitacaoDto } from './create-solicitacao.dto';

export class UpdateSolicitacaoDto extends PartialType(CreateSolicitacaoDto) {}
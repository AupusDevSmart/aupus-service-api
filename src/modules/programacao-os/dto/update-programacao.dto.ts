import { PartialType } from '@nestjs/swagger';
import { CreateProgramacaoDto } from './create-programacao.dto';

export class UpdateProgramacaoDto extends PartialType(CreateProgramacaoDto) {}
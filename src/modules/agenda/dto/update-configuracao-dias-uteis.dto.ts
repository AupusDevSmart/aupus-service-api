import { PartialType } from '@nestjs/mapped-types';
import { CreateConfiguracaoDiasUteisDto } from './create-configuracao-dias-uteis.dto';

export class UpdateConfiguracaoDiasUteisDto extends PartialType(CreateConfiguracaoDiasUteisDto) {}
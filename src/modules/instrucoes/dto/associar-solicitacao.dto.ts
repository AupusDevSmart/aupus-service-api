import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * O corpo de vincular uma instrução a uma solicitação (29/out/2026). Era um tipo
 * literal, que o ValidationPipe não confere: um objeto no `solicitacao_id` virava
 * filtro do Prisma e o vínculo, 500; as observações não tinham teto.
 */
export class AssociarSolicitacaoDto {
  @ApiProperty({ description: 'A solicitação de serviço' })
  @IsString()
  @MaxLength(26)
  solicitacao_id: string;

  @ApiPropertyOptional({ description: 'Observações do vínculo', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacoes?: string;
}

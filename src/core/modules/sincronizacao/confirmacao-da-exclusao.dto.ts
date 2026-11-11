import { IsBoolean, IsOptional } from 'class-validator';
import { BooleanoDoTexto } from '@/common/decorators/booleano';

/**
 * A confirmação de excluir o que está compartilhado com o outro produto
 * (10/11/2026). Sem ela, `DELETE /plantas/:id` e `DELETE /unidades/:id` recusam
 * com 409 quando há algo compartilhado na cascata.
 */
export class ConfirmacaoDaExclusaoDto {
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean({ message: 'confirmarCompartilhado é true ou false.' })
  confirmarCompartilhado?: boolean;
}

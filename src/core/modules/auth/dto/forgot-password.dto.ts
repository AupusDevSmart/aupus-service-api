import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EmailNormalizado } from '../../../../common/decorators/contato';

/**
 * DTO para solicitar a redefinicao de senha.
 * Recebe apenas o email; a resposta e sempre generica (anti-enumeracao).
 */
export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email da conta que deseja redefinir a senha' })
  @EmailNormalizado()
  @IsEmail({}, { message: 'Email invalido' })
  @IsNotEmpty({ message: 'Email e obrigatorio' })
  email: string;
}

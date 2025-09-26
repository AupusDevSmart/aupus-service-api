import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelarReservaDto {
  @ApiProperty({
    description: 'Motivo do cancelamento da reserva',
    example: 'Mudança de planos'
  })
  @IsString({ message: 'Motivo deve ser uma string' })
  @IsNotEmpty({ message: 'Motivo do cancelamento é obrigatório' })
  motivo: string;
}
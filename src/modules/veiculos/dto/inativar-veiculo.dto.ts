import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InativarVeiculoDto {
  @ApiProperty({
    description: 'Motivo da inativação do veículo',
    example: 'Veículo vendido'
  })
  @IsString({ message: 'Motivo deve ser uma string' })
  @IsNotEmpty({ message: 'Motivo da inativação é obrigatório' })
  motivoInativacao: string;
}
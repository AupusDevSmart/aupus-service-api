import { PartialType } from '@nestjs/mapped-types';
import { CreateVeiculoDto } from './create-veiculo.dto';
import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVeiculoDto extends PartialType(CreateVeiculoDto) {
  @ApiPropertyOptional({
    description: 'Usuário que está atualizando o veículo',
    example: 'Maria Santos'
  })
  @IsString({ message: 'Atualizado por deve ser uma string' })
  @IsOptional()
  atualizadoPor?: string;

  @ApiPropertyOptional({
    description: 'ID do usuário que está atualizando'
  })
  @IsString({ message: 'ID do usuário deve ser uma string' })
  @IsOptional()
  atualizadoPorId?: string;
}
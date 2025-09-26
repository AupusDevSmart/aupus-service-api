import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusReserva, TipoSolicitante } from '@prisma/client';

export class VeiculoReservaDto {
  @ApiProperty({
    description: 'ID do veículo',
    example: 'vei_01234567890123456789012345'
  })
  id: string;

  @ApiProperty({
    description: 'Nome do veículo',
    example: 'Corolla Branco'
  })
  nome: string;

  @ApiProperty({
    description: 'Placa do veículo',
    example: 'ABC-1234'
  })
  placa: string;

  @ApiProperty({
    description: 'Tipo do veículo',
    example: 'carro'
  })
  tipo: string;

  @ApiProperty({
    description: 'Capacidade de passageiros',
    example: 5
  })
  capacidadePassageiros: number;
}

export class ReservaResponseDto {
  @ApiProperty({
    description: 'ID da reserva',
    example: 'res_01234567890123456789012345'
  })
  id: string;

  @ApiProperty({
    description: 'ID do veículo reservado',
    example: 'vei_01234567890123456789012345'
  })
  veiculoId: string;

  @ApiPropertyOptional({
    description: 'Dados do veículo',
    type: VeiculoReservaDto
  })
  veiculo?: VeiculoReservaDto;

  @ApiPropertyOptional({
    description: 'ID do solicitante (OS, viagem, etc)',
    example: 'OS-2025-001'
  })
  solicitanteId?: string;

  @ApiProperty({
    description: 'Tipo de solicitante',
    enum: TipoSolicitante,
    example: TipoSolicitante.ordem_servico
  })
  tipoSolicitante: TipoSolicitante;

  @ApiProperty({
    description: 'Data de início da reserva',
    example: '2025-01-20T00:00:00.000Z'
  })
  dataInicio: Date;

  @ApiProperty({
    description: 'Data de fim da reserva',
    example: '2025-01-20T00:00:00.000Z'
  })
  dataFim: Date;

  @ApiProperty({
    description: 'Hora de início (HH:mm)',
    example: '08:00'
  })
  horaInicio: string;

  @ApiProperty({
    description: 'Hora de fim (HH:mm)',
    example: '18:00'
  })
  horaFim: string;

  @ApiProperty({
    description: 'Nome do responsável pela reserva',
    example: 'Maria Santos'
  })
  responsavel: string;

  @ApiPropertyOptional({
    description: 'ID do usuário responsável'
  })
  responsavelId?: string;

  @ApiProperty({
    description: 'Finalidade da reserva',
    example: 'Execução de OS de manutenção'
  })
  finalidade: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais',
    example: 'Levar equipamentos específicos'
  })
  observacoes?: string;

  @ApiProperty({
    description: 'Status da reserva',
    enum: StatusReserva,
    example: StatusReserva.ativa
  })
  status: StatusReserva;

  @ApiPropertyOptional({
    description: 'Motivo do cancelamento (se cancelada)'
  })
  motivoCancelamento?: string;

  @ApiPropertyOptional({
    description: 'Data do cancelamento',
    example: '2025-01-19T15:30:00.000Z'
  })
  dataCancelamento?: Date;

  @ApiPropertyOptional({
    description: 'Nome de quem cancelou'
  })
  canceladoPor?: string;

  @ApiPropertyOptional({
    description: 'ID de quem cancelou'
  })
  canceladoPorId?: string;

  @ApiProperty({
    description: 'Data de criação',
    example: '2025-01-19T10:00:00.000Z'
  })
  criadoEm: Date;

  @ApiProperty({
    description: 'Data de última atualização',
    example: '2025-01-19T10:00:00.000Z'
  })
  atualizadoEm: Date;

  @ApiPropertyOptional({
    description: 'Nome de quem criou a reserva'
  })
  criadoPor?: string;

  @ApiPropertyOptional({
    description: 'ID de quem criou a reserva'
  })
  criadoPorId?: string;
}
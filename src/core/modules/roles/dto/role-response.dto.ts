import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RoleResponseDto {
  @ApiProperty({ description: 'ID único da role' })
  id: number;

  @ApiProperty({ description: 'Nome da role' })
  name: string;

  @ApiProperty({ description: 'Nome do guard' })
  guard_name: string;

  @ApiPropertyOptional({ description: 'Como a tela mostra o papel (da matriz de permissões)' })
  nome_exibido?: string;

  @ApiPropertyOptional({ description: 'O que o papel faz' })
  descricao?: string;

  @ApiPropertyOptional({ description: 'O que o papel enxerga (escopo por planta)' })
  escopo?: string;

  @ApiPropertyOptional({ description: 'Posição na hierarquia (0 = o que menos pode); ausente para papel fora da matriz' })
  ordem?: number;

  @ApiProperty({ description: 'Data de criação' })
  created_at: Date;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: Date;

  @ApiProperty({ 
    description: 'Permissões associadas à role',
    type: 'array',
    items: { type: 'object' },
    required: false
  })
  permissions?: {
    id: number;
    name: string;
    guard_name: string;
  }[];
}
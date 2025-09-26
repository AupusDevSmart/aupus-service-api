import { ApiProperty } from '@nestjs/swagger';

export class PermissionResponseDto {
  @ApiProperty({ description: 'ID único da permissão' })
  id: number;

  @ApiProperty({ description: 'Nome da permissão' })
  name: string;

  @ApiProperty({ description: 'Nome do guard' })
  guard_name: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: Date;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: Date;
}
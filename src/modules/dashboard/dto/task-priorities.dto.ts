import { ApiProperty } from '@nestjs/swagger';

class TarefaPrioridadeDto {
  @ApiProperty({ description: 'ID da tarefa', example: 'clx1234567890' })
  id: string;

  @ApiProperty({ description: 'Nome da tarefa', example: 'Inspecionar conexões do inversor' })
  nome: string;

  @ApiProperty({ description: 'Criticidade (1-5)', example: 5 })
  criticidade: number;

  @ApiProperty({ description: 'Status da tarefa', example: 'ATIVA' })
  status: string;

  @ApiProperty({ description: 'Nome do equipamento', example: 'Inversor Solar 01' })
  equipamento_nome: string;

  @ApiProperty({ description: 'Data de criação', example: '2025-01-10T10:00:00Z' })
  criado_em: Date;
}

export class DashboardTaskPrioritiesDto {
  @ApiProperty({
    description: 'Lista de tarefas ordenadas por criticidade',
    type: [TarefaPrioridadeDto]
  })
  tarefas: TarefaPrioridadeDto[];

  @ApiProperty({ description: 'Total de tarefas ativas', example: 15 })
  total_tarefas_ativas: number;

  @ApiProperty({ description: 'Tarefas com criticidade muito alta (5)', example: 3 })
  tarefas_criticidade_muito_alta: number;

  @ApiProperty({ description: 'Tarefas com criticidade alta (4)', example: 5 })
  tarefas_criticidade_alta: number;
}

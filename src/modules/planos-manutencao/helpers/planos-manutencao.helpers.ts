// src/modules/planos-manutencao/helpers/planos-manutencao.helpers.ts
import { BadRequestException } from '@nestjs/common';
import { StatusPlano } from '@aupus/api-shared';

/**
 * Converte string de data para objeto Date
 * Aceita formatos: "2025-09-13" ou "2025-09-13T10:30:00.000Z"
 */
export function converterStringParaDate(dataString: string | Date): Date {
  if (dataString instanceof Date) {
    return dataString;
  }

  if (typeof dataString === 'string') {
    // Se é apenas uma data (YYYY-MM-DD), adicionar hora para evitar problemas de timezone
    if (dataString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return new Date(dataString + 'T00:00:00.000Z');
    }
    // Se já é um datetime ISO, usar diretamente
    return new Date(dataString);
  }

  throw new BadRequestException('Formato de data inválido');
}

/**
 * Conta itens por status em um array de estatísticas
 */
export function contarPorStatus(stats: any[], status: StatusPlano): number {
  return stats.find(s => s.status === status)?._count || 0;
}

/**
 * Conta itens por tipo de manutenção em um array de distribuição
 */
export function contarPorTipo(distribuicao: any[], tipo: string): number {
  return distribuicao.find(d => d.tipo_manutencao === tipo)?._count || 0;
}

/**
 * Gera uma TAG única para tarefa baseada no equipamento e prefixo
 * Formato: PREFIXO-001, PREFIXO-002, etc.
 */
export async function gerarNovaTag(
  tarefasExistentes: Array<{ tag: string }>,
  prefixo: string
): Promise<string> {
  // Contar tarefas existentes e gerar próximo número
  const totalTarefas = tarefasExistentes.length;
  const proximoNumero = totalTarefas + 1;

  // Gerar TAG no formato: PREFIXO-001, PREFIXO-002, etc.
  const numeroFormatado = proximoNumero.toString().padStart(3, '0');
  const novaTag = `${prefixo}-${numeroFormatado}`;

  // Verificar se TAG já existe (improvável, mas garantir unicidade)
  const tagExiste = tarefasExistentes.some(t => t.tag === novaTag);
  if (tagExiste) {
    // Se existir, usar timestamp como fallback
    return `${prefixo}-${Date.now()}`;
  }

  return novaTag;
}

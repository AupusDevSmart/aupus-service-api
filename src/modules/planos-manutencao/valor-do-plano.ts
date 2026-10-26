import { centavos } from '../recursos/regras-do-recurso';
import type { ValorDaInstrucao } from '../instrucoes/valor-da-instrucao';

/**
 * O valor de um plano de manutenção pelo cadastro: cada tarefa vale o que a sua
 * instrução vale (`valoresDasInstrucoes`, a mesma conta da proposta e da OS), e o
 * plano vale a soma das tarefas.
 *
 * Três regras que a tela precisa poder dizer em voz alta:
 * - tarefa sem instrução não tem valor (`valor: null`), não "zero": não há de onde
 *   tirar o custo, e zero pareceria um trabalho que não custa nada;
 * - tarefa inativa mostra o valor mas não entra no total — ela não gera OS;
 * - instrução com linha sem preço no cadastro soma zero nessa linha (é sugestão),
 *   então a tarefa é marcada `sem_preco` e o plano diz quantas são, senão o total
 *   parecia completo e saía abaixo do custo.
 *
 * É uma soma de UMA execução de cada tarefa, sem a periodicidade: quanto custa o
 * plano por ano é outra pergunta, que depende de quantas vezes cada tarefa roda.
 */
export interface TarefaParaValor {
  id: string;
  ativo: boolean;
  instrucao_id: string | null;
}

export interface ValorDaTarefa {
  valor: number | null;
  sem_preco: boolean;
}

export interface ValorDoPlano {
  porTarefa: Map<string, ValorDaTarefa>;
  total: number;
  /** Tarefas ativas com instrução que tem linha sem preço: o total está abaixo do custo. */
  tarefas_sem_preco: number;
}

export function valorDoPlano(tarefas: TarefaParaValor[], valores: Map<string, ValorDaInstrucao>): ValorDoPlano {
  const porTarefa = new Map<string, ValorDaTarefa>();
  let soma = 0;
  let tarefasSemPreco = 0;

  for (const tarefa of tarefas) {
    const instrucaoId = tarefa.instrucao_id?.trim();
    const daInstrucao = instrucaoId ? valores.get(instrucaoId) : undefined;
    if (!daInstrucao) {
      porTarefa.set(tarefa.id, { valor: null, sem_preco: false });
      continue;
    }

    porTarefa.set(tarefa.id, { valor: daInstrucao.valor, sem_preco: daInstrucao.semPreco });
    if (!tarefa.ativo) continue;
    soma += daInstrucao.valor;
    if (daInstrucao.semPreco) tarefasSemPreco += 1;
  }

  return { porTarefa, total: centavos(soma), tarefas_sem_preco: tarefasSemPreco };
}

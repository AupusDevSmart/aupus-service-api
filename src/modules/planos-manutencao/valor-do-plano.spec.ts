import { valorDoPlano } from './valor-do-plano';
import type { ValorDaInstrucao } from '../instrucoes/valor-da-instrucao';

/**
 * A conta do valor do plano. O que custaria erro calado se quebrasse: a tarefa
 * sem instrução virar "zero" (parece trabalho de graça), a inativa entrar no
 * total (ela não gera OS) e a linha sem preço sumir do aviso (o total sairia
 * abaixo do custo sem ninguém saber).
 */
describe('valorDoPlano', () => {
  const valores = new Map<string, ValorDaInstrucao>([
    ['INST-A', { valor: 100.1, semPreco: false }],
    ['INST-B', { valor: 200.2, semPreco: false }],
    ['INST-SEM-PRECO', { valor: 50, semPreco: true }],
  ]);

  const tarefa = (id: string, instrucao: string | null, ativo = true) => ({ id, ativo, instrucao_id: instrucao });

  it('soma o valor da instrução de cada tarefa', () => {
    const plano = valorDoPlano([tarefa('t1', 'INST-A'), tarefa('t2', 'INST-B')], valores);

    expect(plano.porTarefa.get('t1')).toEqual({ valor: 100.1, sem_preco: false });
    expect(plano.porTarefa.get('t2')).toEqual({ valor: 200.2, sem_preco: false });
    // 100.1 + 200.2 em ponto flutuante dá 300.29999...: o total sai em centavos
    expect(plano.total).toBe(300.3);
    expect(plano.tarefas_sem_preco).toBe(0);
  });

  it('duas tarefas com a mesma instrução somam duas vezes', () => {
    const plano = valorDoPlano([tarefa('t1', 'INST-A'), tarefa('t2', 'INST-A')], valores);

    expect(plano.total).toBe(200.2);
  });

  it('tarefa sem instrução não tem valor, e não é "sem preço"', () => {
    const plano = valorDoPlano([tarefa('t1', null), tarefa('t2', 'INST-A')], valores);

    expect(plano.porTarefa.get('t1')).toEqual({ valor: null, sem_preco: false });
    expect(plano.total).toBe(100.1);
    expect(plano.tarefas_sem_preco).toBe(0);
  });

  it('a instrução fora do mapa também não tem valor', () => {
    const plano = valorDoPlano([tarefa('t1', 'INST-QUE-NAO-EXISTE')], valores);

    expect(plano.porTarefa.get('t1')).toEqual({ valor: null, sem_preco: false });
    expect(plano.total).toBe(0);
  });

  it('o id da instrução com espaço (Char) casa', () => {
    const plano = valorDoPlano([tarefa('t1', 'INST-A  ')], valores);

    expect(plano.porTarefa.get('t1')?.valor).toBe(100.1);
  });

  it('tarefa inativa mostra o valor mas não entra no total nem no aviso', () => {
    const plano = valorDoPlano(
      [tarefa('t1', 'INST-A'), tarefa('t2', 'INST-B', false), tarefa('t3', 'INST-SEM-PRECO', false)],
      valores,
    );

    expect(plano.porTarefa.get('t2')).toEqual({ valor: 200.2, sem_preco: false });
    expect(plano.porTarefa.get('t3')).toEqual({ valor: 50, sem_preco: true });
    expect(plano.total).toBe(100.1);
    expect(plano.tarefas_sem_preco).toBe(0);
  });

  it('conta as tarefas ativas cuja instrução tem linha sem preço', () => {
    const plano = valorDoPlano(
      [tarefa('t1', 'INST-SEM-PRECO'), tarefa('t2', 'INST-SEM-PRECO'), tarefa('t3', 'INST-A')],
      valores,
    );

    expect(plano.porTarefa.get('t1')).toEqual({ valor: 50, sem_preco: true });
    expect(plano.tarefas_sem_preco).toBe(2);
    expect(plano.total).toBe(200.1);
  });

  it('plano sem tarefas vale zero', () => {
    const plano = valorDoPlano([], valores);

    expect(plano.total).toBe(0);
    expect(plano.porTarefa.size).toBe(0);
  });
});

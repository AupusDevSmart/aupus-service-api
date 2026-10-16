/**
 * A comparação ANTES de ligar a periodicidade por calendário (SN-54). Só lê.
 *
 * Para cada tarefa mensal ou mais longa que o gerador programa, o vencimento
 * de hoje (dias fixos) contra o novo (o mesmo dia do mês) — o próximo e o
 * quarto, para ver o escorregão de um ano — e se há programação aberta (ela
 * segue segurando o ciclo: o gerador casa o ciclo antigo também).
 *
 * Rodar: npx ts-node -r tsconfig-paths/register scripts/db/comparar-periodicidade.ts
 * Ligar depois de ver: PERIODICIDADE_POR_CALENDARIO=on no .env da API e restart.
 */
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '@/core';
import { buscarCiclosAbertos, buscarTarefasElegiveis, buscarUltimasExecucoes, cicloAberto, cicloNoSegundo } from '../../src/modules/tarefas/ciclos-das-tarefas';
import { FREQUENCIA_MESES, calcularProximaExecucao, ciclosEquivalentes, somarCiclos, type TarefaPeriodica } from '../../src/modules/tarefas/periodicidade';

const prisma = new PrismaClient();
const DIA_MS = 86_400_000;

/** O dia em Brasília (-03:00), como a tela mostra. */
const dia = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10) : '—');
const diferenca = (de: Date | null, para: Date | null) => (de && para ? Math.round((para.getTime() - de.getTime()) / DIA_MS) : 0);

/** O quarto ciclo um passo de cada vez, como o gerador e a agenda (prende o dia no mês curto). */
function quarto(tarefa: TarefaPeriodica, proximo: Date | null, porCalendario: boolean): Date | null {
  let ciclo = proximo;
  for (let i = 0; i < 3 && ciclo; i++) ciclo = somarCiclos(tarefa, ciclo, 1, porCalendario);
  return ciclo;
}

async function main() {
  const db = prisma as unknown as PrismaService;
  const tarefas = (await buscarTarefasElegiveis(db)).filter((t) => FREQUENCIA_MESES[t.frequencia ?? '']);
  const ids = tarefas.map((t) => t.id.trim());
  const [ultimas, abertos] = await Promise.all([buscarUltimasExecucoes(db, ids), buscarCiclosAbertos(db, ids)]);

  const linhas = tarefas.map((t) => {
    const ultima = ultimas.get(t.id.trim());
    const hoje = calcularProximaExecucao(t, ultima, false);
    const novo = calcularProximaExecucao(t, ultima, true);
    // Pelas duas contas: rodado de novo com a troca ligada, a aberta pode estar na data nova
    const aberto = cicloAberto(abertos, t.id, null, ciclosEquivalentes(t, ultima).map(cicloNoSegundo));
    return {
      tarefa: t.tag,
      equipamento: t.equipamento?.nome ?? '',
      frequencia: t.frequencia,
      proximo_hoje: dia(hoje),
      proximo_novo: dia(novo),
      dias: diferenca(hoje, novo),
      quarto_hoje: dia(quarto(t, hoje, false)),
      quarto_novo: dia(quarto(t, novo, true)),
      aberto: aberto ? (aberto.status ?? 'aberto') : '',
    };
  });

  console.table(linhas);
  const mudam = linhas.filter((l) => l.dias !== 0);
  const maior = linhas.reduce((m, l) => (Math.abs(l.dias) > Math.abs(m) ? l.dias : m), 0);
  console.log(`\n${linhas.length} tarefas mensais ou mais longas; ${mudam.length} mudam o próximo vencimento (maior diferença: ${maior} dias).`);
  console.log(`${linhas.filter((l) => l.aberto).length} já têm programação aberta: seguem programadas (o gerador casa o ciclo antigo).`);
  console.log('Nada foi gravado.');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

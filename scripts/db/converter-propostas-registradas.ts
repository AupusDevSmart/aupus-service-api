/**
 * Passa as propostas em edição para a conta de imposto e margem (29/out/2026, no deploy, uma vez).
 *
 * O BDI saiu: a proposta nova nasce com os percentuais padrão (imposto, margem e
 * administração). A REGISTRADA ainda não foi revisada nem mandada como aceita, e
 * decisão do usuário é ela passar para a conta nova — senão a lista mostraria o
 * total do BDI até alguém abri-la (a edição a converteria de qualquer jeito, e o
 * total mudaria na frente da pessoa sem aviso). A programada e a finalizada ficam
 * com o BDI: são documento, com o PDF que o cliente recebeu.
 *
 * Entra também a REGISTRADA sem percentual: a que a API antiga criou na janela do
 * deploy (o banco já dava a conta nova de padrão, sem os percentuais).
 *
 * Os percentuais copiados são os padrão: **confirme-os na tela (botão
 * "Percentuais") antes de aplicar**. Enquanto ninguém os salvou, são os números de
 * simulação da spec, e o `--aplicar` recusa (trocar o padrão depois não reescreve
 * as propostas já convertidas). `--com-os-da-spec` aplica mesmo assim.
 *
 * O desconto em reais maior que o faturamento novo da Aupus para nele (a prévia
 * avisa): quem cuida da proposta confere.
 *
 * PRÉVIA POR PADRÃO: lista o que muda e não grava.
 *   npx ts-node -r tsconfig-paths/register scripts/db/converter-propostas-registradas.ts
 *   npx ts-node -r tsconfig-paths/register scripts/db/converter-propostas-registradas.ts --aplicar
 *
 * Depois do SQL `2026-10-29-proposta-imposto-e-margem.sql` e com o código novo no
 * ar: cada uma pela mesma conta e a mesma trava da tela, com uma linha no histórico.
 * A que falha (um teto, a trava que não veio em 5 s) é listada e o resto segue.
 */
import { PrismaClient } from '@prisma/client';
import { recalcularProposta } from '../../src/modules/solicitacoes-servico/recalculo-da-proposta';
import { padroesDaProposta } from '../../src/modules/solicitacoes-servico/padroes-da-proposta';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const comOsDaSpec = process.argv.includes('--com-os-da-spec');

/** Desfaz a transação da prévia: a conta roda inteira e nada fica */
class Previa extends Error {}

const reais = (valor: unknown) => Number(valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const padroes = await padroesDaProposta(prisma);
  const linhaDosPadroes = await prisma.padroes_da_proposta.findUnique({ where: { id: 1 }, select: { updated_at: true } });
  console.log(
    `Percentuais padrão: imposto ${padroes.imposto}%, margem ${padroes.margem}%, administração ${padroes.admServicos}% dos serviços e ${padroes.admFd}% do direto` +
      (linhaDosPadroes?.updated_at ? ` (salvos em ${linhaDosPadroes.updated_at.toISOString()}).` : ' (os da spec: ninguém os salvou ainda).'),
  );
  if (aplicar && !linhaDosPadroes?.updated_at && !comOsDaSpec) {
    console.error('Recusado: confirme os percentuais na tela (botão "Percentuais") antes de aplicar, ou rode com --com-os-da-spec.');
    process.exitCode = 1;
    return;
  }

  const solicitacoes = await prisma.solicitacoes_servico.findMany({
    where: { deleted_at: null, status: 'REGISTRADA', OR: [{ conta_da_proposta: 'BDI' }, { imposto_percentual: null }] },
    select: { id: true, numero: true },
    orderBy: { numero: 'asc' },
  });

  const linhas: string[] = [];
  const falhas: string[] = [];
  for (const s of solicitacoes) {
    try {
      await prisma.$transaction(async (tx) => {
        // A trava da escrita da proposta: ninguém a muda no meio. Conferidos de novo depois dela
        const [travada] = await tx.$queryRaw<{ status: string; conta: string; sem_imposto: boolean; total_geral: unknown }[]>`
          SELECT status::text AS status, conta_da_proposta AS conta, imposto_percentual IS NULL AS sem_imposto, total_geral
            FROM solicitacoes_servico WHERE id = ${s.id} FOR UPDATE`;
        if (travada?.status !== 'REGISTRADA' || (travada.conta !== 'BDI' && !travada.sem_imposto)) return;
        const conta = await recalcularProposta(tx, s.id);
        const deOnde = travada.conta === 'BDI' ? 'BDI' : 'conta nova sem os percentuais';
        const aviso = conta.desconto.pedido > conta.desconto.aplicado ? ` (o desconto de R$ ${reais(conta.desconto.pedido)} parou em R$ ${reais(conta.desconto.aplicado)})` : '';
        const texto = `de R$ ${reais(travada.total_geral)} (${deOnde}) para R$ ${reais(conta.totalGeral)} (imposto e margem)${aviso}`;
        linhas.push(`${s.numero.trim()}: ${texto}`);
        if (!aplicar) throw new Previa();
        await tx.historico_solicitacao_servico.create({
          data: { solicitacao_id: s.id, acao: 'PROPOSTA_CONVERTIDA', usuario_nome: 'Sistema', observacoes: `Proposta passada para a conta de imposto e margem: ${texto}.` },
        });
      });
    } catch (erro) {
      if (erro instanceof Previa) continue;
      falhas.push(`${s.numero.trim()}: ${(erro as Error)?.message ?? erro}`);
    }
  }

  console.log(`${solicitacoes.length} proposta(s) registrada(s) para passar à conta nova.`);
  for (const linha of linhas) console.log(`  ${linha}`);
  if (falhas.length > 0) {
    console.error(`${falhas.length} não passaram (o resto seguiu):`);
    for (const falha of falhas) console.error(`  ${falha}`);
    process.exitCode = 1;
  }
  console.log(aplicar ? 'Gravado.' : 'Prévia: nada gravado. Rode com --aplicar para gravar.');
}

main()
  .catch((e) => {
    console.error('FALHOU:', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

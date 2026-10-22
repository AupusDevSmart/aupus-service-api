/**
 * O custo real das OS executadas e auditadas pela regra do SN-93 (no deploy, uma vez).
 *
 * Até o SN-93 o `custo_real` gravado era só mão de obra e material; desde ele, é o
 * apurado inteiro, com os outros custos do orçamento (veículo, hospedagem,
 * instrumentos, terceiros: pelo conferido, ou pelo previsto enquanto ninguém
 * conferir). A OS que estava executada ou auditada no deploy ficava com o número
 * antigo até finalizar: a planilha das OS e a lista exportavam um, o sheet mostrava
 * outro, e o primeiro consumo registrado depois punha na trilha "Consumo
 * registrado. Custo real de R$ 2.000 para R$ 3.330", como se o consumo valesse os
 * R$ 1.316 do veículo.
 *
 * A finalizada não muda: o custo dela está no conteúdo que o código prova. A
 * pendente e a em execução não têm custo real ainda (sai no Executar).
 *
 * PRÉVIA POR PADRÃO: lista o que muda e não grava.
 *   npx ts-node -r tsconfig-paths/register scripts/db/refazer-custo-real.ts
 *   npx ts-node -r tsconfig-paths/register scripts/db/refazer-custo-real.ts --aplicar
 *
 * Com o código novo no ar (depois do restart): em cada OS, a trava de gravação
 * (`travarOSAlteravel`), como o registro de consumo, e a linha "CUSTO_REAL" na trilha.
 */
import { PrismaClient, StatusOS } from '@prisma/client';
import { reais } from '../../src/modules/execucao-os/custo-da-os';
import { custoRealDaOS } from '../../src/modules/execucao-os/dados-do-custo';
import { travarOSAlteravel } from '../../src/modules/execucao-os/os-alteravel';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const APURADAS: StatusOS[] = [StatusOS.EXECUTADA, StatusOS.AUDITADA];

async function main() {
  const ordens = await prisma.ordens_servico.findMany({
    where: { deletado_em: null, status: { in: APURADAS } },
    select: { id: true, numero_os: true, status: true },
    orderBy: { numero_os: 'asc' },
  });

  const mudancas: { os: string; status: string; antes: string; depois: string }[] = [];
  for (const os of ordens) {
    await prisma.$transaction(
      async (tx) => {
        // A mesma trava do registro de consumo: a OS não finaliza nem reabre no meio
        const status = await travarOSAlteravel(tx, os.id, 'gravar');
        if (!APURADAS.includes(status)) return;
        const antes = (await tx.ordens_servico.findUniqueOrThrow({ where: { id: os.id }, select: { custo_real: true } })).custo_real;
        const depois = await custoRealDaOS(tx, os.id);
        if (depois.equals(antes ?? 0)) return;
        mudancas.push({ os: os.numero_os.trim(), status, antes: reais(antes), depois: reais(depois) });
        if (!aplicar) return;
        await tx.ordens_servico.update({ where: { id: os.id }, data: { custo_real: depois } });
        await tx.historico_os.create({
          data: {
            os_id: os.id,
            acao: 'CUSTO_REAL',
            usuario: 'Sistema',
            observacoes: `Custo real refeito pela regra nova, com os outros custos do orçamento (SN-93): de R$ ${reais(antes)} para R$ ${reais(depois)}.`,
          },
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }

  console.table(mudancas);
  console.log(`\n${ordens.length} OS executadas ou auditadas; ${mudancas.length} mudam o custo real.`);
  console.log(aplicar ? 'Gravado, com a linha CUSTO_REAL na trilha de cada uma.' : 'PRÉVIA: nada gravado. Para gravar: --aplicar');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

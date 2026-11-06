/**
 * Carrega nas programações e OS já criadas o planejado das instruções delas
 * (materiais, equipe, ferramentas e outros custos), pela mesma regra que a
 * programação nova passou a seguir em 05/nov/2026 (`planejado-das-instrucoes.ts`).
 *
 * Até então o sheet não somava os recursos das instruções da origem e o
 * servidor também não: as programações nasciam com as instruções, mas sem
 * nenhum recurso delas, e a OS aprovada herdava o vazio.
 *
 * Só acrescenta: entra cada recurso das instruções que a lista ainda não tem com
 * a mesma descrição (material, especialidade, ferramenta, outro custo), e nada
 * do que já existe é trocado ou apagado — o que alguém planejou à mão fica, e o
 * que a proposta trouxe (frete, veículo, diárias) também. Rodar de novo não dobra.
 *   - programação PENDENTE ou APROVADA: grava o que falta e soma o custo dele ao
 *     orçamento previsto (o previsto de antes fica, com os ajustes que tiver);
 *   - OS PENDENTE, EM_EXECUCAO ou PAUSADA dessa programação: o mesmo na OS.
 * Fica de fora, e aparece no relatório: programação FINALIZADA/CANCELADA, OS
 * EXECUTADA/AUDITADA (o custo real já foi apurado com o que havia),
 * FINALIZADA (o conteúdo é selado pelo código de verificação) e CANCELADA.
 *
 * (Até 06/nov/2026 a regra era "só as quatro listas vazias", e a programação da
 * solicitação ficava de fora: ela nasce com os outros custos da proposta.)
 *
 * Filtra pela descrição EXATA (sem caixa, sem espaço nas pontas). A prévia
 * também conta as que só CONTÊM o texto, para conferir se o filtro pegou todas.
 *
 * PRÉVIA POR PADRÃO: lista o que muda e não grava.
 *   npx ts-node -r tsconfig-paths/register scripts/db/carregar-recursos-das-instrucoes.ts --descricao "O&M Preventiva usina de telhado/residencial"
 *   npx ts-node -r tsconfig-paths/register scripts/db/carregar-recursos-das-instrucoes.ts --descricao "..." --aplicar
 *
 * Uma transação por programação (com a OS dela), com a trava de gravação da OS.
 */
import { Prisma, PrismaClient, StatusOS } from '@prisma/client';
import { instrucoesDasLinhas } from '../../src/modules/execucao-os/tarefas-das-linhas';
import { travarOSAlteravel } from '../../src/modules/execucao-os/os-alteravel';
import { planejadoDasInstrucoes, type PlanejadoDasInstrucoes } from '../../src/modules/programacao-os/planejado-das-instrucoes';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const indice = process.argv.indexOf('--descricao');
const descricao = indice >= 0 ? process.argv[indice + 1]?.trim() : undefined;

const PROGRAMACAO_ALTERAVEL = ['PENDENTE', 'APROVADA'];
const OS_ALTERAVEL: StatusOS[] = [StatusOS.PENDENTE, StatusOS.EM_EXECUCAO, StatusOS.PAUSADA];

const centavos = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** A mesma conta do `calcularOrcamentoPrevisto` da programação */
const orcamentoDe = (p: PlanejadoDasInstrucoes) =>
  centavos(
    p.materiais.reduce((s, m) => s + (m.custo_unitario ?? 0) * m.quantidade_planejada, 0) +
      p.tecnicos.reduce((s, t) => s + (t.custo_hora ?? 0) * t.horas_estimadas, 0) +
      p.itens_orcamento.reduce((s, i) => s + i.valor, 0),
  );

const vazio = (p: PlanejadoDasInstrucoes) =>
  !p.materiais.length && !p.tecnicos.length && !p.ferramentas.length && !p.itens_orcamento.length;

const resumo = (p: PlanejadoDasInstrucoes) =>
  `${p.materiais.length} material(is), ${p.tecnicos.length} vaga(s) de técnico, ${p.ferramentas.length} ferramenta(s), ${p.itens_orcamento.length} outro(s) custo(s), previsto R$ ${orcamentoDe(p).toFixed(2)}`;

async function gravarNaProgramacao(tx: Prisma.TransactionClient, programacaoId: string, p: PlanejadoDasInstrucoes) {
  if (p.materiais.length)
    await tx.materiais_programacao_os.createMany({
      data: p.materiais.map((m) => ({
        programacao_id: programacaoId,
        descricao: m.descricao,
        quantidade_planejada: m.quantidade_planejada,
        unidade: m.unidade,
        custo_unitario: m.custo_unitario,
        custo_total: m.custo_unitario ? centavos(m.custo_unitario * m.quantidade_planejada) : null,
      })),
    });
  if (p.ferramentas.length)
    await tx.ferramentas_programacao_os.createMany({
      data: p.ferramentas.map((f) => ({ programacao_id: programacaoId, descricao: f.descricao, quantidade: f.quantidade, unidade: f.unidade ?? null })),
    });
  if (p.tecnicos.length)
    await tx.tecnicos_programacao_os.createMany({
      data: p.tecnicos.map((t) => ({
        programacao_id: programacaoId,
        especialidade: t.especialidade,
        horas_estimadas: t.horas_estimadas,
        custo_hora: t.custo_hora,
        custo_total: t.custo_hora ? centavos(t.custo_hora * t.horas_estimadas) : null,
      })),
    });
  if (p.itens_orcamento.length)
    await tx.itens_orcamento_programacao_os.createMany({
      data: p.itens_orcamento.map((i) => ({ programacao_id: programacaoId, descricao: i.descricao, valor: i.valor, natureza: i.natureza ?? 'OUTRO' })),
    });
}

async function gravarNaOS(tx: Prisma.TransactionClient, osId: string, p: PlanejadoDasInstrucoes) {
  if (p.materiais.length)
    await tx.materiais_os.createMany({
      data: p.materiais.map((m) => ({
        os_id: osId,
        descricao: m.descricao,
        quantidade_planejada: m.quantidade_planejada,
        unidade: m.unidade,
        custo_unitario: m.custo_unitario,
        custo_total: m.custo_unitario ? centavos(m.custo_unitario * m.quantidade_planejada) : null,
      })),
    });
  if (p.ferramentas.length)
    await tx.ferramentas_os.createMany({
      data: p.ferramentas.map((f) => ({ os_id: osId, descricao: f.descricao, quantidade: f.quantidade, unidade: f.unidade ?? null })),
    });
  if (p.tecnicos.length)
    await tx.tecnicos_os.createMany({
      data: p.tecnicos.map((t) => ({
        os_id: osId,
        especialidade: t.especialidade,
        horas_estimadas: t.horas_estimadas,
        custo_hora: t.custo_hora,
        custo_total: t.custo_hora ? centavos(t.custo_hora * t.horas_estimadas) : null,
      })),
    });
  if (p.itens_orcamento.length)
    await tx.itens_orcamento_os.createMany({
      data: p.itens_orcamento.map((i) => ({ os_id: osId, descricao: i.descricao, valor: i.valor, natureza: i.natureza ?? 'OUTRO' })),
    });
}

/** O que já está planejado, pela descrição (sem caixa, sem espaço nas pontas) de cada lista */
interface JaPlanejado {
  materiais: Set<string>;
  tecnicos: Set<string>;
  ferramentas: Set<string>;
  itens: Set<string>;
}

const chave = (texto: string | null | undefined) => (texto ?? '').trim().toLowerCase();
const conjunto = (linhas: { descricao?: string | null; especialidade?: string | null }[]) =>
  new Set(linhas.map((l) => chave(l.descricao ?? l.especialidade)));

/**
 * O planejado das instruções menos o que a lista já tem com a mesma descrição.
 * A programação da solicitação nasce com os outros custos da proposta (frete,
 * veículo, diárias); eles não são recurso de instrução e não impedem a carga.
 */
const oQueFalta = (p: PlanejadoDasInstrucoes, ja: JaPlanejado): PlanejadoDasInstrucoes => ({
  materiais: p.materiais.filter((m) => !ja.materiais.has(chave(m.descricao))),
  tecnicos: p.tecnicos.filter((t) => !ja.tecnicos.has(chave(t.especialidade))),
  ferramentas: p.ferramentas.filter((f) => !ja.ferramentas.has(chave(f.descricao))),
  itens_orcamento: p.itens_orcamento.filter((i) => !ja.itens.has(chave(i.descricao))),
});

async function listasDaProgramacao(tx: Prisma.TransactionClient, id: string): Promise<JaPlanejado> {
  const onde = { where: { programacao_id: id } };
  const [m, t, f, i] = await Promise.all([
    tx.materiais_programacao_os.findMany({ ...onde, select: { descricao: true } }),
    tx.tecnicos_programacao_os.findMany({ ...onde, select: { especialidade: true } }),
    tx.ferramentas_programacao_os.findMany({ ...onde, select: { descricao: true } }),
    tx.itens_orcamento_programacao_os.findMany({ ...onde, select: { descricao: true } }),
  ]);
  return { materiais: conjunto(m), tecnicos: conjunto(t), ferramentas: conjunto(f), itens: conjunto(i) };
}

async function listasDaOS(tx: Prisma.TransactionClient, id: string): Promise<JaPlanejado> {
  const onde = { where: { os_id: id } };
  const [m, t, f, i] = await Promise.all([
    tx.materiais_os.findMany({ ...onde, select: { descricao: true } }),
    tx.tecnicos_os.findMany({ ...onde, select: { especialidade: true } }),
    tx.ferramentas_os.findMany({ ...onde, select: { descricao: true } }),
    tx.itens_orcamento_os.findMany({ ...onde, select: { descricao: true } }),
  ]);
  return { materiais: conjunto(m), tecnicos: conjunto(t), ferramentas: conjunto(f), itens: conjunto(i) };
}

/** O previsto de antes (com o que a proposta trouxe e qualquer ajuste) mais o que entrou agora */
const somarAoPrevisto = (antes: Prisma.Decimal | null, entrou: PlanejadoDasInstrucoes) => centavos(Number(antes ?? 0) + orcamentoDe(entrou));

async function main() {
  if (!descricao) throw new Error('Informe --descricao "<texto exato da programação>"');
  console.log(aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado; --aplicar grava)');

  const programacoes = await prisma.programacoes_os.findMany({
    where: { deletado_em: null, descricao: { contains: descricao, mode: 'insensitive' } },
    select: { id: true, codigo: true, descricao: true, status: true, orcamento_previsto: true },
    orderBy: { codigo: 'asc' },
  });
  const exatas = programacoes.filter((p) => p.descricao.trim().toLowerCase() === descricao.toLowerCase());
  const parecidas = programacoes.filter((p) => !exatas.includes(p));
  console.log(`Programações com a descrição exata: ${exatas.length}`);
  if (parecidas.length) {
    console.log(`ATENÇÃO: ${parecidas.length} programação(ões) só CONTÊM o texto (ficam de fora):`);
    for (const p of parecidas) console.log(`  ${p.codigo.trim()} [${p.status}] "${p.descricao}"`);
  }

  const contagem = { programacoes: 0, os: 0, puladas: 0 };
  for (const prog of exatas) {
    await prisma.$transaction(
      async (tx) => {
        const linhas = await tx.tarefas_programacao_os.findMany({
          where: { programacao_id: prog.id },
          select: { tarefa_id: true, instrucao_id: true, instrucao_tag: true },
          orderBy: { ordem: 'asc' },
        });
        // Uma instrução por linha: a mesma instrução em duas tarefas conta duas vezes (a regra do criar)
        const instrucoes = await instrucoesDasLinhas(tx, linhas);
        const planejado = await planejadoDasInstrucoes(tx, instrucoes);
        const codigo = prog.codigo.trim();

        if (vazio(planejado)) {
          console.log(`${codigo}: as ${linhas.length} instrução(ões) não têm recurso cadastrado — nada a carregar`);
          contagem.puladas += 1;
          return;
        }
        // A programação
        const falta = oQueFalta(planejado, await listasDaProgramacao(tx, prog.id));
        if (!PROGRAMACAO_ALTERAVEL.includes(prog.status)) {
          console.log(`${codigo}: programação ${prog.status} — fica como está`);
        } else if (vazio(falta)) {
          console.log(`${codigo}: programação já tem os recursos das instruções — fica como está`);
        } else {
          const previsto = somarAoPrevisto(prog.orcamento_previsto, falta);
          console.log(`${codigo}: programação recebe ${resumo(falta)}; previsto de R$ ${Number(prog.orcamento_previsto ?? 0).toFixed(2)} para R$ ${previsto.toFixed(2)}`);
          contagem.programacoes += 1;
          if (aplicar) {
            await gravarNaProgramacao(tx, prog.id, falta);
            await tx.programacoes_os.update({ where: { id: prog.id }, data: { orcamento_previsto: previsto } });
            await tx.historico_programacao_os.create({
              data: {
                programacao_id: prog.id,
                acao: 'RECURSOS_DAS_INSTRUCOES',
                usuario: 'Sistema',
                observacoes: `Recursos das instruções carregados (não vinham ao programar): ${resumo(falta)}.`,
              },
            });
          }
        }

        // A OS dessa programação
        const ordens = await tx.ordens_servico.findMany({
          where: { programacao_id: prog.id, deletado_em: null },
          select: { id: true, numero_os: true, status: true, orcamento_previsto: true },
        });
        for (const os of ordens) {
          const numero = os.numero_os.trim();
          if (!OS_ALTERAVEL.includes(os.status)) {
            console.log(`  OS ${numero}: ${os.status} — fica como está (custo apurado ou conteúdo selado)`);
            continue;
          }
          const status = await travarOSAlteravel(tx, os.id, 'gravar');
          if (!OS_ALTERAVEL.includes(status)) continue;
          const faltaNaOS = oQueFalta(planejado, await listasDaOS(tx, os.id));
          if (vazio(faltaNaOS)) {
            console.log(`  OS ${numero}: já tem os recursos das instruções — fica como está`);
            continue;
          }
          const previstoDaOS = somarAoPrevisto(os.orcamento_previsto, faltaNaOS);
          console.log(
            `  OS ${numero} [${status}]: recebe ${resumo(faltaNaOS)}; previsto de R$ ${Number(os.orcamento_previsto ?? 0).toFixed(2)} para R$ ${previstoDaOS.toFixed(2)}`,
          );
          contagem.os += 1;
          if (!aplicar) continue;
          await gravarNaOS(tx, os.id, faltaNaOS);
          await tx.ordens_servico.update({ where: { id: os.id }, data: { orcamento_previsto: previstoDaOS } });
          await tx.historico_os.create({
            data: {
              os_id: os.id,
              acao: 'RECURSOS_DAS_INSTRUCOES',
              usuario: 'Sistema',
              observacoes: `Recursos das instruções carregados (não vinham da programação): ${resumo(faltaNaOS)}.`,
            },
          });
        }
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  }

  console.log(
    `${aplicar ? 'Gravado' : 'Gravaria'}: ${contagem.programacoes} programação(ões) e ${contagem.os} OS; ${contagem.puladas} sem recurso cadastrado nas instruções.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

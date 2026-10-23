import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '@/core';
import { variantesDeId, variantesDeIds } from '@/modules/tarefas/ids';
import { chave } from '../catalogo-por-nome';
import {
  ErrosDaLinha,
  type ErroNaPlanilha,
  type ItemDeCatalogo,
  type PlanoDaPlanilha,
  type TarefaDoPlanoDaPlanilha,
  type UsuarioDaImportacao,
} from '../importacao.types';
import type { PlanosImportacao } from './planos.importacao';

type Template = { id: string; nome: string };

/**
 * Os planos que a planilha de equipamentos cita (coluna PLANO), para o motor
 * criar antes dos equipamentos (SN-98, decisão do usuário de 23/out/2026). Até
 * ali, plano que não existia era erro na linha: era preciso importar a planilha
 * de planos antes.
 *
 * Chega uma entrada por aba; aqui se juntam as do mesmo plano.
 * - Já existe um template com esse nome: nada a fazer (o equipamento só é
 *   vinculado, como sempre). As tarefas da planilha não contam: são as da cópia
 *   de cada equipamento, que pode ser customizada — abas diferentes não são erro.
 *   Na aba de equipamento novo com tarefas que não são as do plano, avisa que
 *   elas ficam de fora.
 * - A aba não conta para criar quando o nome é o do plano de hoje do equipamento
 *   (a cópia, ou o template dela mesmo excluído: é o que a exportação escreve) —
 *   a regra de `resolverPlano`. E o ID DO PLANO de um template que hoje tem
 *   outro nome é erro: com o nome valendo, o plano renomeado depois da exportação
 *   viraria um duplicado, e os equipamentos sairiam do plano de verdade calados.
 * - O resto cria o template da CATEGORIA da aba, com as TAREFAS DO PLANO, pelo
 *   mesmo caminho da planilha de planos (a instrução pelo código ou pelo nome,
 *   frequência e criticidade validadas como na tela). As abas têm de concordar
 *   na categoria e nas tarefas; aba sem tarefas não conta (só não disse quais são).
 * - Criar plano pede `manutencao.manage`, a permissão da tela de planos.
 */
export function itensDosPlanosCitados(
  prisma: PrismaService,
  planos: PlanosImportacao,
  citados: PlanoDaPlanilha[],
  usuario: UsuarioDaImportacao,
): ItemDeCatalogo[] {
  // Os templates vivos, lidos uma vez (dentro da transação), mais os que os itens criam
  let templates: Template[] | null = null;
  const lerTemplates = async () =>
    (templates ??= await prisma.planos_manutencao.findMany({ where: { plano_origem_id: null, deleted_at: null }, select: { id: true, nome: true } }));

  const porNome = new Map<string, PlanoDaPlanilha[]>();
  for (const citado of citados) {
    const abas = porNome.get(chave(citado.nome));
    if (abas) abas.push(citado);
    else porNome.set(chave(citado.nome), [citado]);
  }

  return [...porNome.values()].map((abas) => {
    const [primeira] = abas;
    return {
      aba: primeira.aba,
      linha: primeira.linha,
      campo: 'plano',
      rotulo: `Plano "${primeira.nome}"`,
      gravar: async () => {
        const vivos = await lerTemplates();
        const existente = vivos.find((t) => chave(t.nome) === chave(primeira.nome));
        if (existente) {
          const avisos = await tarefasQueFicamDeFora(prisma, existente, abas);
          return avisos.length > 0 ? { avisos } : null;
        }

        const { paraCriar, trocam } = await abasQueCriam(prisma, abas);
        if (paraCriar.length === 0) return null;

        if (!usuario.permissions.includes('manutencao.manage')) {
          throw new ForbiddenException('não existe, e criar plano pede a permissão da tela de planos (manutencao.manage).');
        }
        const { categoria, tarefas } = oPlanoNovo(paraCriar);

        let criado: { id: string };
        try {
          const dados = await planos.prepararDados({ nome: primeira.nome, categoria, tarefas: paraOPlano(tarefas) }, usuario, null);
          criado = await planos.criar(await planos.validar(dados, null), usuario);
        } catch (erro) {
          if (!(erro instanceof ErrosDaLinha)) throw erro;
          // "tarefas.2.instrucao" → "tarefa 3 (Inspeção termográfica): ...", na seção da aba que disse as tarefas
          const fonte = paraCriar.find((a) => a.tarefas === tarefas) ?? paraCriar[0];
          throw new ErrosDaLinha(
            erro.erros.map((e) => {
              const i = /^tarefas\.(\d+)/.exec(e.campo)?.[1];
              const tarefa = i === undefined ? null : tarefas[Number(i)];
              return tarefa
                ? { campo: 'plano', aba: fonte.aba, linha: fonte.linha_das_tarefas, mensagem: `tarefa ${Number(i) + 1} (${tarefa.nome ?? tarefa.instrucao}): ${e.mensagem}` }
                : { campo: 'plano', mensagem: e.mensagem };
            }),
          );
        }
        vivos.push({ id: criado.id, nome: primeira.nome });

        const n = tarefas.length;
        return {
          feito: {
            cadastro: 'plano' as const,
            acao: 'novo' as const,
            nome: primeira.nome,
            detalhe: `categoria ${categoria}, ${n === 0 ? 'sem tarefas' : n === 1 ? '1 tarefa' : `${n} tarefas`}`,
          },
          // O equipamento que tem plano e vai para o novo: pode ser o plano dele renomeado, com o ID DO PLANO apagado
          avisos: trocam.map(({ aba, deHoje }) => ({
            aba: aba.aba,
            linha: aba.linha,
            mensagem: `é criado agora, e este equipamento sai do plano "${deHoje}" para ele. Se "${primeira.nome}" é o nome antigo de "${deHoje}", escreva "${deHoje}" em PLANO.`,
          })),
        };
      },
    };
  });
}

/**
 * As abas que de fato pedem um plano novo: sem a do plano de hoje do equipamento.
 * O ID DO PLANO de um template vivo (com outro nome, senão ele teria sido achado
 * pelo nome) é erro; o de um excluído ou de outro sistema não conta.
 */
async function abasQueCriam(prisma: PrismaService, abas: PlanoDaPlanilha[]) {
  const erros: ErroNaPlanilha[] = [];
  const paraCriar: PlanoDaPlanilha[] = [];
  const trocam: Array<{ aba: PlanoDaPlanilha; deHoje: string }> = [];

  for (const aba of abas) {
    const deHoje = aba.equipamento_id ? await nomesDoPlanoDeHoje(prisma, aba.equipamento_id) : [];
    if (deHoje.some((n) => chave(n) === chave(aba.nome))) continue;
    // O nome do template (o último) é o que a tela mostra
    if (deHoje.length > 0) trocam.push({ aba, deHoje: deHoje[deHoje.length - 1] });

    if (aba.plano_ref) {
      const doId = await prisma.planos_manutencao.findFirst({
        where: { id: { in: variantesDeId(aba.plano_ref) }, plano_origem_id: null, deleted_at: null },
        select: { nome: true },
      });
      if (doId) {
        erros.push({
          campo: 'plano',
          aba: aba.aba,
          linha: aba.linha,
          mensagem: `não existe, e o ID DO PLANO desta aba é do plano "${doId.nome}" (renomeado depois da exportação?). Para vincular a ele, escreva "${doId.nome}" em PLANO; para criar um plano novo com este nome, apague o ID DO PLANO.`,
        });
        continue;
      }
    }
    paraCriar.push(aba);
  }

  if (erros.length > 0) throw new ErrosDaLinha(erros);
  return { paraCriar, trocam };
}

/** O nome da cópia do equipamento e o do template dela, mesmo excluído: o que a exportação pode ter escrito em PLANO */
async function nomesDoPlanoDeHoje(prisma: PrismaService, equipamentoId: string): Promise<string[]> {
  const copia = await prisma.planos_manutencao.findFirst({
    where: { equipamento_id: { in: variantesDeId(equipamentoId) }, deleted_at: null },
    select: { nome: true, plano_origem_id: true },
  });
  if (!copia) return [];
  const origem = copia.plano_origem_id
    ? await prisma.planos_manutencao.findFirst({ where: { id: { in: variantesDeId(copia.plano_origem_id) } }, select: { nome: true } })
    : null;
  return [copia.nome, ...(origem ? [origem.nome] : [])];
}

/**
 * O plano já existe e o equipamento novo recebe as tarefas DELE: as que a
 * pessoa escreveu na aba (sem ID, copiada da MODELO) e não são as do plano
 * ficam de fora — é decisão (a planilha não muda plano que existe), mas não
 * pode ser calada. Na aba de equipamento que já existe, as tarefas são as da
 * cópia, que pode ser customizada: não avisa.
 */
async function tarefasQueFicamDeFora(prisma: PrismaService, template: Template, abas: PlanoDaPlanilha[]) {
  const novas = abas.filter((a) => !a.equipamento_id && a.tarefas.length > 0);
  if (novas.length === 0) return [];

  const tarefas = await prisma.tarefas.findMany({
    where: { plano_manutencao_id: { in: variantesDeId(template.id) }, deleted_at: null },
    select: { nome: true, instrucao_id: true, frequencia: true, frequencia_personalizada: true, criticidade: true },
  });
  const ids = tarefas.map((t) => t.instrucao_id).filter((id): id is string => !!id);
  const instrucoes = await prisma.instrucoes.findMany({ where: { id: { in: variantesDeIds(ids) } }, select: { id: true, codigo: true, nome: true } });
  const daInstrucao = new Map(instrucoes.map((i) => [i.id.trim(), [i.codigo, i.nome].filter((x): x is string => !!x).map(chave)]));
  const doPlano = tarefas.map((t) => ({ ...t, instrucao: daInstrucao.get(t.instrucao_id?.trim() ?? '') ?? [] }));

  return novas
    .filter((a) => !mesmasTarefas(a.tarefas, doPlano))
    .map((a) => ({
      aba: a.aba,
      linha: a.linha_das_tarefas,
      mensagem: `já existe, e o equipamento recebe as tarefas dele: as TAREFAS DO PLANO desta aba não são as do plano e ficam de fora (a planilha não muda plano que já existe; mude na tela de Planos).`,
    }));
}

type TarefaDoTemplate = { nome: string; instrucao: string[]; frequencia: string | null; frequencia_personalizada: number | null; criticidade: number };

/** Cada tarefa da aba casa com uma do plano: instrução pelo código ou pelo nome, periodicidade, criticidade e o nome, se a aba diz */
function mesmasTarefas(daAba: TarefaDoPlanoDaPlanilha[], doPlano: TarefaDoTemplate[]) {
  if (daAba.length !== doPlano.length) return false;
  const livres = [...doPlano];
  return daAba.every((t) => {
    const i = livres.findIndex(
      (p) =>
        p.instrucao.includes(chave(t.instrucao)) &&
        p.frequencia === t.frequencia &&
        (p.frequencia !== 'PERSONALIZADA' || p.frequencia_personalizada === t.frequencia_personalizada) &&
        (t.criticidade === null || p.criticidade === t.criticidade) &&
        (!t.nome || chave(p.nome) === chave(t.nome)),
    );
    if (i < 0) return false;
    livres.splice(i, 1);
    return true;
  });
}

/**
 * A categoria e as tarefas do plano que vai ser criado, de todas as abas que o
 * citam — ou o erro de cada uma que não concorda (ou cuja tarefa o front não leu).
 */
function oPlanoNovo(abas: PlanoDaPlanilha[]): { categoria: string; tarefas: TarefaDoPlanoDaPlanilha[] } {
  const erros: ErroNaPlanilha[] = abas.flatMap((a) => a.problemas.map((p) => ({ campo: 'plano', aba: a.aba, linha: p.linha, mensagem: p.mensagem })));

  const daCategoria = abas.find((a) => a.categoria);
  const daTarefas = abas.find((a) => a.tarefas.length > 0);
  for (const a of abas) {
    if (daCategoria && a.categoria && chave(a.categoria) !== chave(daCategoria.categoria!)) {
      erros.push({
        campo: 'plano',
        aba: a.aba,
        linha: a.linha,
        mensagem: `não existe, e esta aba é de um equipamento da categoria ${a.categoria}, e a aba ${daCategoria.aba} de um da categoria ${daCategoria.categoria}. O plano novo é de uma categoria só: use nomes diferentes para planos de categorias diferentes.`,
      });
    }
    if (daTarefas && a.tarefas.length > 0 && assinatura(a.tarefas) !== assinatura(daTarefas.tarefas)) {
      erros.push({
        campo: 'plano',
        aba: a.aba,
        linha: a.linha_das_tarefas,
        mensagem: `não existe e é criado com as TAREFAS DO PLANO da planilha, e as desta aba são diferentes das da aba ${daTarefas.aba}. Deixe-as iguais nas abas que citam o plano, ou a seção vazia nas outras.`,
      });
    }
  }
  if (!daCategoria) {
    erros.push({ campo: 'plano', mensagem: 'não existe, e a aba não diz a CATEGORIA do equipamento: o plano novo é criado na categoria dele.' });
  }
  if (erros.length > 0) throw new ErrosDaLinha(erros);

  return { categoria: daCategoria!.categoria!, tarefas: daTarefas?.tarefas ?? [] };
}

/** Vazio fica de fora, para o DTO da tarefa dizer o que falta */
function paraOPlano(tarefas: TarefaDoPlanoDaPlanilha[]) {
  return tarefas.map(({ nome, instrucao, frequencia, frequencia_personalizada, criticidade }) => ({
    id: null,
    instrucao,
    ...(nome && { nome }),
    ...(frequencia && { frequencia }),
    ...(frequencia_personalizada !== null && { frequencia_personalizada }),
    ...(criticidade !== null && { criticidade }),
  }));
}

/** As tarefas comparadas sem caixa, acento nem ordem */
function assinatura(tarefas: TarefaDoPlanoDaPlanilha[]) {
  return JSON.stringify(
    tarefas
      .map((t) => [chave(t.nome ?? ''), chave(t.instrucao), t.frequencia, t.frequencia_personalizada, t.criticidade])
      .map((t) => JSON.stringify(t))
      .sort(),
  );
}

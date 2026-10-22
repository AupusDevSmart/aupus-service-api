import type { itens_orcamento_os, materiais_os, Prisma, tarefas_os, tecnicos_os } from '@prisma/client';
import { valoresDasInstrucoes } from '../instrucoes/valor-da-instrucao';
import type { ConteudoDaOS } from './conteudo-da-os';
import { naturezaDoItem } from './natureza-do-custo';
import { custoRealDosDados, type DadosDoCusto, type OutroCustoDoCusto } from './resumo-do-custo';
import { instrucoesDasLinhas, valoresParaCongelar } from './tarefas-das-linhas';

/**
 * De onde o resumo do custo (`resumo-do-custo.ts`) lê: as linhas da OS (o sheet
 * e o `custo_real` gravado) ou o conteúdo registrado na finalização (o PDF da OS
 * finalizada, que é o que o código prova).
 */

const numero = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** O que se lê de cada tabela para a conta */
export interface LinhasDoCusto {
  orcamento_previsto: Prisma.Decimal | null;
  custos_adicionais: Prisma.Decimal | null;
  tecnicos: Pick<tecnicos_os, 'nome' | 'especialidade' | 'horas_estimadas' | 'horas_trabalhadas' | 'custo_hora'>[];
  materiais: Pick<materiais_os, 'descricao' | 'unidade' | 'quantidade_planejada' | 'quantidade_consumida' | 'custo_unitario'>[];
  itens_orcamento: Pick<itens_orcamento_os, 'descricao' | 'natureza' | 'valor' | 'valor_real' | 'nao_previsto'>[];
  tarefas_os: Pick<
    tarefas_os,
    'instrucao_tag' | 'nome_snapshot' | 'instrucao_nome' | 'equipamento_nome' | 'status' | 'valor' | 'valor_original' | 'instrucao_id' | 'tarefa_id'
  >[];
}

type Leitor = Pick<Prisma.TransactionClient, 'instrucao_recursos' | 'instrucao_maquinarios' | 'tarefas' | 'instrucoes'>;

const outroDaLinha = (i: LinhasDoCusto['itens_orcamento'][number]): OutroCustoDoCusto => ({
  descricao: i.descricao.trim(),
  natureza: naturezaDoItem(i.natureza),
  previsto: Number(i.valor),
  real: numero(i.valor_real),
  nao_previsto: i.nao_previsto,
});

/**
 * O valor do cadastro de agora de cada linha sem valor (de antes do SN-93), pela
 * instrução dela; a linha com valor não entra
 */
async function valoresDeHoje(db: Leitor, linhas: LinhasDoCusto['tarefas_os']): Promise<Map<LinhasDoCusto['tarefas_os'][number], number | null>> {
  const semValor = linhas.filter((t) => t.valor === null);
  const instrucoes = await instrucoesDasLinhas(db, semValor);
  const valores = instrucoes.some(Boolean) ? await valoresDasInstrucoes(db, instrucoes) : new Map<string, { valor: number }>();
  return new Map(semValor.map((t, i) => [t, instrucoes[i] ? (valores.get(instrucoes[i]!)?.valor ?? null) : null]));
}

/**
 * Pelas linhas da OS. A linha de antes do SN-93 (sem valor) mostra o valor do
 * cadastro de agora, marcado como tal: em branco, a pessoa não saberia quanto vale.
 */
export async function dadosDoCustoDaOS(db: Leitor, os: LinhasDoCusto, outrosNoReal = true): Promise<DadosDoCusto> {
  // A lista que a consulta não trouxe é vazia, como no mapeamento da resposta da OS
  const tarefas = os.tarefas_os ?? [];
  const hoje = await valoresDeHoje(db, tarefas);
  return {
    equipe: (os.tecnicos ?? []).map((t) => ({
      nome: t.nome,
      especialidade: t.especialidade,
      horas_estimadas: Number(t.horas_estimadas),
      horas_trabalhadas: numero(t.horas_trabalhadas),
      custo_hora: numero(t.custo_hora),
    })),
    materiais: (os.materiais ?? []).map((m) => ({
      descricao: m.descricao.trim(),
      unidade: m.unidade.trim(),
      quantidade_planejada: Number(m.quantidade_planejada),
      quantidade_consumida: numero(m.quantidade_consumida),
      custo_unitario: numero(m.custo_unitario),
    })),
    outros: (os.itens_orcamento ?? []).map(outroDaLinha),
    custos_adicionais: numero(os.custos_adicionais),
    instrucoes: tarefas.map((t) => ({
      codigo: t.instrucao_tag?.trim() || null,
      nome: t.nome_snapshot?.trim() || t.instrucao_nome?.trim() || null,
      equipamento: t.equipamento_nome?.trim() || null,
      status: t.status,
      valor: numero(t.valor),
      valor_original: numero(t.valor_original),
      valor_do_cadastro_hoje: hoje.get(t) ?? null,
    })),
    orcamento_previsto: numero(os.orcamento_previsto),
    outros_no_real: outrosNoReal,
  };
}

/**
 * O custo real que a OS grava (no executar, no consumo e nos outros custos
 * registrados depois, no finalizar): o total do resumo, uma conta só (SN-81).
 * Até o SN-93 eram só mão de obra e material.
 */
export async function custoRealDaOS(tx: Prisma.TransactionClient, osId: string): Promise<Prisma.Decimal> {
  const [os, tecnicos, materiais, itens] = await Promise.all([
    tx.ordens_servico.findUniqueOrThrow({ where: { id: osId }, select: { custos_adicionais: true, orcamento_previsto: true } }),
    tx.tecnicos_os.findMany({ where: { os_id: osId } }),
    tx.materiais_os.findMany({ where: { os_id: osId } }),
    tx.itens_orcamento_os.findMany({ where: { os_id: osId } }),
  ]);
  const dados = await dadosDoCustoDaOS(tx, { ...os, tecnicos, materiais, itens_orcamento: itens, tarefas_os: [] });
  return custoRealDosDados(dados);
}

/**
 * Na finalização, antes de selar: a linha de antes do SN-93, sem valor, recebe
 * o do cadastro de agora. O registro sai completo, e o PDF da OS finalizada não
 * muda quando o cadastro da instrução mudar depois.
 */
export async function congelarValoresDasInstrucoes(tx: Prisma.TransactionClient, osId: string): Promise<void> {
  const linhas = await tx.tarefas_os.findMany({
    where: { os_id: osId, valor: null },
    select: { id: true, instrucao_id: true, instrucao_tag: true, tarefa_id: true },
  });
  for (const { id, valor } of await valoresParaCongelar(tx, linhas)) {
    await tx.tarefas_os.update({ where: { id }, data: { valor, valor_original: valor } });
  }
}

/** O que a versão 1 do conteúdo não registrou, lido do sistema na emissão (fora do código) */
export interface ComplementoDaVersao1 {
  outros: OutroCustoDoCusto[];
  custos_adicionais: number | null;
  orcamento_previsto: number | null;
  /** Por id da tarefa da OS: o equipamento e o valor do cadastro de agora */
  tarefas: Map<string, { equipamento: string | null; valor_do_cadastro_hoje: number | null }>;
}

/**
 * Pelo conteúdo registrado. Na versão 2 está tudo nele. Na 1 (finalizada antes
 * do SN-93), os outros custos e o valor das instruções não estavam: vêm do
 * complemento, e ficam fora do total (o custo real registrado não os tinha).
 */
export function dadosDoCustoDoConteudo(conteudo: ConteudoDaOS, complemento?: ComplementoDaVersao1): DadosDoCusto {
  const v2 = conteudo.versao >= 2;
  return {
    equipe: conteudo.equipe.map((t) => ({
      nome: t.nome,
      especialidade: t.especialidade,
      horas_estimadas: t.horas_estimadas,
      horas_trabalhadas: t.horas_trabalhadas,
      custo_hora: t.custo_hora,
    })),
    materiais: conteudo.materiais.map((m) => ({
      descricao: m.descricao,
      unidade: m.unidade,
      quantidade_planejada: m.quantidade_planejada,
      quantidade_consumida: m.quantidade_consumida,
      custo_unitario: m.custo_unitario,
    })),
    outros: v2
      ? (conteudo.outros_custos ?? []).map((o) => ({ ...o, natureza: naturezaDoItem(o.natureza) }))
      : (complemento?.outros ?? []),
    custos_adicionais: v2 ? (conteudo.os.custos_adicionais ?? null) : (complemento?.custos_adicionais ?? null),
    instrucoes: conteudo.tarefas.map((t) => {
      const extra = complemento?.tarefas.get(t.id);
      return {
        codigo: t.instrucao_tag,
        nome: t.nome ?? t.instrucao_nome,
        equipamento: t.equipamento ?? extra?.equipamento ?? null,
        status: t.status,
        valor: t.valor ?? null,
        valor_original: t.valor_original ?? null,
        valor_do_cadastro_hoje: t.valor == null ? (extra?.valor_do_cadastro_hoje ?? null) : null,
      };
    }),
    orcamento_previsto: v2 ? (conteudo.os.orcamento_previsto ?? null) : (complemento?.orcamento_previsto ?? null),
    outros_no_real: v2,
  };
}

/** O complemento da versão 1: os outros custos, os adicionais e o equipamento e o valor de hoje de cada tarefa */
export async function complementoDaVersao1(
  db: Pick<Prisma.TransactionClient, 'ordens_servico' | 'itens_orcamento_os' | 'tarefas_os' | 'tarefas' | 'instrucoes' | 'instrucao_recursos' | 'instrucao_maquinarios'>,
  osId: string,
): Promise<ComplementoDaVersao1> {
  const [os, itens, tarefas] = await Promise.all([
    db.ordens_servico.findUniqueOrThrow({ where: { id: osId }, select: { custos_adicionais: true, orcamento_previsto: true } }),
    db.itens_orcamento_os.findMany({ where: { os_id: osId }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }] }),
    db.tarefas_os.findMany({
      where: { os_id: osId },
      select: { id: true, equipamento_nome: true, instrucao_id: true, instrucao_tag: true, tarefa_id: true, valor: true },
    }),
  ]);
  const instrucoes = await instrucoesDasLinhas(db, tarefas);
  const hoje = await valoresDasInstrucoes(db, instrucoes);
  return {
    outros: itens.map(outroDaLinha),
    custos_adicionais: numero(os.custos_adicionais),
    orcamento_previsto: numero(os.orcamento_previsto),
    tarefas: new Map(
      tarefas.map((t, i) => [
        t.id.trim(),
        {
          equipamento: t.equipamento_nome?.trim() || null,
          valor_do_cadastro_hoje: numero(t.valor) ?? (instrucoes[i] ? (hoje.get(instrucoes[i]!)?.valor ?? null) : null),
        },
      ]),
    ),
  };
}

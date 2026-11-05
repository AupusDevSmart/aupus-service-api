import type { Prisma } from '@prisma/client';
import { linhaDoMaquinario, linhaDoRecurso, type LinhaDeCusto } from '../instrucoes/custo-da-instrucao';
import { ROTULO_DO_ITEM, type NaturezaDoOutroCusto } from '../execucao-os/natureza-do-custo';
import { variantesDeIds } from '../tarefas/ids';
import { origemDaProgramacao } from '../../common/helpers/status-da-origem';
import { instrucoesDaOrigem } from './instrucoes-da-programacao';
import type {
  CreateProgramacaoDto,
  FerramentaProgramacaoDto,
  ItemOrcamentoProgramacaoDto,
  MaterialProgramacaoDto,
  TecnicoProgramacaoDto,
} from './dto/create-programacao.dto';

/**
 * O planejado que as instruções da programação sugerem — materiais, equipe,
 * ferramentas e outros custos —, no servidor (05/nov/2026).
 *
 * A tela já fazia essa conta ao vivo (`features/programacao-os/utils/recursos-das-instrucoes.ts`,
 * SN-86), mas só ela: a programação que nasce sem passar pelo formulário (o
 * cron dos planos, as rotas `from-anomalia`, `from-solicitacao` e `from-tarefas`)
 * chegava à OS sem nenhum recurso das instruções. A regra é a mesma da tela, e
 * as descrições também: a edição na tela reconhece o que veio daqui.
 *
 *   MATERIAL                    -> materiais, com o custo unitário
 *   MAO_DE_OBRA                 -> técnicos: uma vaga por pessoa, com o custo da hora
 *   INSTRUMENTO e o maquinário  -> ferramentas, e o custo no orçamento
 *   VEICULO, TERCEIRO,
 *   DESPESA_CAMPO               -> orçamento
 *
 * **Mudou a regra aqui, muda na tela junto** (e vice-versa).
 */
export interface PlanejadoDasInstrucoes {
  materiais: MaterialProgramacaoDto[];
  ferramentas: FerramentaProgramacaoDto[];
  tecnicos: TecnicoProgramacaoDto[];
  itens_orcamento: ItemOrcamentoProgramacaoDto[];
}

export const SEM_PRECO = '(sem preço no cadastro)';
/** O material sem unidade no cadastro */
export const UNIDADE_PADRAO = 'un';

/** O que a linha de técnico aceita (TecnicoProgramacaoDto): de 0,25 a 24 h */
export const HORAS_DA_VAGA = { minimo: 0.25, maximo: 24 };

const casas = (x: number, n: number) => {
  const fator = 10 ** n;
  return Math.round((x + Number.EPSILON) * fator) / fator;
};
const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const nenhumPlanejado = (): PlanejadoDasInstrucoes => ({ materiais: [], ferramentas: [], tecnicos: [], itens_orcamento: [] });

/** O que o pedido traz do planejado: com qualquer lista, quem chamou planejou (a tela sempre manda as quatro) */
export const pedidoTrazPlanejado = (dto: Pick<CreateProgramacaoDto, 'materiais' | 'ferramentas' | 'tecnicos' | 'itens_orcamento'>) =>
  [dto.materiais, dto.ferramentas, dto.tecnicos, dto.itens_orcamento].some((lista) => lista !== undefined);

/** A natureza do custo pela categoria do recurso; a categoria nova, que ninguém previu, é OUTRO */
const naturezaDaCategoria = (categoria: string): NaturezaDoOutroCusto =>
  categoria === 'INSTRUMENTO' || categoria === 'VEICULO' || categoria === 'TERCEIRO' || categoria === 'DESPESA_CAMPO' ? categoria : 'OUTRO';

/** O item do orçamento: com o valor, marcado quando não há preço; nada quando é zero (o cliente fornece) */
function noOrcamento(descricao: string, custo: number | null, natureza: NaturezaDoOutroCusto): ItemOrcamentoProgramacaoDto[] {
  if (custo == null) return [{ descricao: `${descricao} ${SEM_PRECO}`, valor: 0, natureza }];
  return custo > 0 ? [{ descricao, valor: casas(custo, 2), natureza }] : [];
}

/** As horas de uma pessoa em vagas que a linha aceita: até 24 h cada, nenhuma abaixo de 0,25 h */
function emVagas(horas: number): number[] {
  if (horas <= 0) return [0];
  const vagas: number[] = [];
  let resto = horas;
  while (resto > HORAS_DA_VAGA.maximo + 0.0005) {
    vagas.push(HORAS_DA_VAGA.maximo);
    resto -= HORAS_DA_VAGA.maximo;
  }
  vagas.push(Math.max(casas(resto, 2), HORAS_DA_VAGA.minimo));
  return vagas;
}

/** Uma vaga de técnico por pessoa, com as horas e o custo da hora da linha */
function vagasDaMaoDeObra(linha: LinhaDeCusto): TecnicoProgramacaoDto[] {
  const pessoas = Math.max(numero(linha.quantidade), 0) || 1;
  const horas = Math.max(numero(linha.duracao_horas), 0);
  const horasDeEquipe = pessoas * horas;
  const custoHora =
    linha.subtotal != null && horasDeEquipe > 0
      ? casas(linha.subtotal / horasDeEquipe, 2)
      : linha.base_calculo === 'hora' && linha.preco_base != null
        ? casas(linha.preco_base, 2)
        : undefined;
  const inteiras = Math.floor(pessoas);
  const fracao = pessoas - inteiras;
  const vagas = Array.from({ length: inteiras }, () => emVagas(horas)).flat();
  if (fracao > 0.0005) vagas.push(...emVagas(horas * fracao));
  return vagas.map((h) => ({
    especialidade: linha.nome.trim() || 'Mão de obra',
    horas_estimadas: h,
    ...(custoHora !== undefined && { custo_hora: custoHora }),
  }));
}

type LinhaComUnidade = LinhaDeCusto & { unidade?: string | null };

function doRecurso(linha: LinhaComUnidade, saida: PlanejadoDasInstrucoes) {
  const nome = linha.nome.trim();
  if (!nome) return;
  const quantidade = numero(linha.quantidade) || 1;
  const custo = linha.subtotal;

  switch (linha.categoria) {
    case 'MATERIAL': {
      // O planejado com a perda: é o que se compra, então arredonda para cima
      const planejada = Math.max(Math.ceil(quantidade * (1 + numero(linha.fator_perda)) * 1000 - 1e-6) / 1000, 0.001);
      saida.materiais.push({
        descricao: nome,
        quantidade_planejada: planejada,
        // A linha de material exige unidade (o DTO recusa vazia); o material é cobrado por unidade
        unidade: linha.unidade?.trim() || UNIDADE_PADRAO,
        ...(custo != null && { custo_unitario: casas(custo / planejada, 2) }),
      });
      return;
    }
    case 'MAO_DE_OBRA': {
      const vagas = vagasDaMaoDeObra(linha);
      saida.tecnicos.push(...vagas);
      // Cobrada sem horas (valor fechado): o custo não cabe na hora da vaga e sumia do
      // orçamento calado. Vai como outro custo; a vaga fica, pedindo as horas
      if (custo != null && custo > 0 && vagas.every((v) => v.custo_hora === undefined)) {
        saida.itens_orcamento.push({ descricao: `Mão de obra: ${nome}`, valor: casas(custo, 2), natureza: 'OUTRO' });
      }
      return;
    }
    case 'INSTRUMENTO':
      saida.ferramentas.push({ descricao: nome, quantidade: casas(quantidade, 3), ...(linha.unidade?.trim() && { unidade: linha.unidade.trim() }) });
      saida.itens_orcamento.push(...noOrcamento(`${ROTULO_DO_ITEM.INSTRUMENTO}: ${nome}`, custo, 'INSTRUMENTO'));
      return;
    default: {
      const natureza = naturezaDaCategoria(linha.categoria);
      saida.itens_orcamento.push(...noOrcamento(`${natureza === 'OUTRO' ? linha.categoria : ROTULO_DO_ITEM[natureza]}: ${nome}`, custo, natureza));
    }
  }
}

function doMaquinario(linha: LinhaDeCusto, saida: PlanejadoDasInstrucoes) {
  const nome = linha.nome.trim();
  if (!nome) return;
  saida.ferramentas.push({ descricao: nome, quantidade: casas(numero(linha.quantidade) || 1, 3) });
  saida.itens_orcamento.push(...noOrcamento(`${ROTULO_DO_ITEM.MAQUINARIO}: ${nome}`, linha.subtotal, 'MAQUINARIO'));
}

/** Média ponderada do preço quando os dois têm; senão o que tiver */
function precoJunto(a: number | undefined, qa: number, b: number | undefined, qb: number) {
  if (a == null) return b;
  if (b == null || qa + qb <= 0) return a;
  return casas((a * qa + b * qb) / (qa + qb), 2);
}

const chaveDoMaterial = (m: Pick<MaterialProgramacaoDto, 'descricao' | 'unidade'>) => `${m.descricao.trim()}|${(m.unidade ?? '').trim()}`;

/** Soma uma instrução ao planejado: a linha igual cresce, a nova entra no fim (a regra do `somar` da tela) */
export function somarPlanejado(atual: PlanejadoDasInstrucoes, mais: PlanejadoDasInstrucoes): PlanejadoDasInstrucoes {
  const saida: PlanejadoDasInstrucoes = {
    materiais: atual.materiais.map((m) => ({ ...m })),
    ferramentas: atual.ferramentas.map((f) => ({ ...f })),
    tecnicos: atual.tecnicos.map((t) => ({ ...t })),
    itens_orcamento: atual.itens_orcamento.map((i) => ({ ...i })),
  };

  for (const m of mais.materiais) {
    const igual = saida.materiais.find((x) => chaveDoMaterial(x) === chaveDoMaterial(m));
    if (!igual) {
      saida.materiais.push({ ...m });
      continue;
    }
    const antes = numero(igual.quantidade_planejada);
    igual.quantidade_planejada = casas(antes + m.quantidade_planejada, 3);
    const preco = precoJunto(igual.custo_unitario, antes, m.custo_unitario, m.quantidade_planejada);
    if (preco !== undefined) igual.custo_unitario = preco;
  }

  for (const f of mais.ferramentas) {
    const igual = saida.ferramentas.find((x) => x.descricao.trim() === f.descricao.trim());
    if (igual) igual.quantidade = casas(numero(igual.quantidade) + f.quantidade, 3);
    else saida.ferramentas.push({ ...f });
  }

  // A vaga i de uma especialidade soma com a vaga i que já existe (a mesma equipe
  // faz as instruções uma depois da outra), enquanto couber nas 24 h; senão abre outra
  const porEspecialidade = new Map<string, TecnicoProgramacaoDto[]>();
  for (const t of mais.tecnicos) {
    const chave = t.especialidade.trim();
    porEspecialidade.set(chave, [...(porEspecialidade.get(chave) ?? []), t]);
  }
  for (const [especialidade, vagas] of porEspecialidade) {
    const existentes = saida.tecnicos.filter((t) => t.especialidade.trim() === especialidade);
    vagas.forEach((vaga, i) => {
      const igual = existentes[i];
      if (!igual || numero(igual.horas_estimadas) + vaga.horas_estimadas > HORAS_DA_VAGA.maximo + 0.0005) {
        saida.tecnicos.push({ ...vaga });
        return;
      }
      const antes = numero(igual.horas_estimadas);
      igual.horas_estimadas = casas(antes + vaga.horas_estimadas, 2);
      const preco = precoJunto(igual.custo_hora, antes, vaga.custo_hora, vaga.horas_estimadas);
      if (preco !== undefined) igual.custo_hora = preco;
    });
  }

  for (const item of mais.itens_orcamento) {
    const igual = saida.itens_orcamento.find((x) => x.descricao.trim() === item.descricao.trim());
    if (igual) igual.valor = casas(numero(igual.valor) + item.valor, 2);
    else saida.itens_orcamento.push({ ...item });
  }

  return saida;
}

/** O que uma instrução sugere, pelas linhas dela com o custo já aberto */
export function contribuicaoDaInstrucao(recursos: LinhaComUnidade[], maquinarios: LinhaDeCusto[]): PlanejadoDasInstrucoes {
  const linhas = nenhumPlanejado();
  for (const linha of recursos) doRecurso(linha, linhas);
  for (const linha of maquinarios) doMaquinario(linha, linhas);
  return somarPlanejado(nenhumPlanejado(), linhas);
}

type Leitor = Pick<Prisma.TransactionClient, 'instrucao_recursos' | 'instrucao_maquinarios'>;

/**
 * O planejado de uma lista de instruções, na ordem dela. Cada ocorrência soma:
 * quem escolhe se a repetida conta é `instrucoesDoPedido` (por tarefa, sim).
 */
export async function planejadoDasInstrucoes(db: Leitor, ids: (string | null | undefined)[]): Promise<PlanejadoDasInstrucoes> {
  const lista = ids.map((id) => id?.trim()).filter((id): id is string => !!id);
  const unicos = [...new Set(lista)];
  if (unicos.length === 0) return nenhumPlanejado();

  // Pelas variantes do id (Char(26) com o id de 25 caracteres), e na ordem da tela da instrução
  const [recursos, maquinarios] = await Promise.all([
    db.instrucao_recursos.findMany({
      where: { instrucao_id: { in: variantesDeIds(unicos) } },
      include: { recurso: true },
      orderBy: [{ recurso: { nome: 'asc' } }, { id: 'asc' }],
    }),
    db.instrucao_maquinarios.findMany({
      where: { instrucao_id: { in: variantesDeIds(unicos) } },
      include: { maquinario: true },
      orderBy: [{ maquinario: { nome: 'asc' } }, { id: 'asc' }],
    }),
  ]);

  const contribuicoes = new Map(
    unicos.map((instrucaoId) => {
      const daInstrucao = (linha: { instrucao_id: string }) => linha.instrucao_id.trim() === instrucaoId;
      return [
        instrucaoId,
        contribuicaoDaInstrucao(
          recursos.filter(daInstrucao).map((r) => ({ ...linhaDoRecurso(r), unidade: r.recurso.unidade })),
          maquinarios.filter(daInstrucao).map((m) => linhaDoMaquinario(m)),
        ),
      ] as const;
    }),
  );
  return lista.reduce((planejado, instrucaoId) => somarPlanejado(planejado, contribuicoes.get(instrucaoId)!), nenhumPlanejado());
}

type LeitorDaProgramacao = Leitor & Pick<Prisma.TransactionClient, 'tarefas'> & Parameters<typeof instrucoesDaOrigem>[0];

/**
 * As instruções que a programação vai ter, antes de gravá-la: as das tarefas
 * (na ordem delas) e as avulsas (a lista do pedido ou, sem ela, as da origem),
 * a mesma escolha do `criar`.
 *
 * A instrução conta **uma vez por tarefa**: o cron junta numa OS as tarefas da
 * mesma unidade e janela, e dez inversores com a mesma limpeza são dez limpezas
 * (a estimativa de horas, `horasDasInstrucoes`, também soma por tarefa). A
 * avulsa conta uma vez, e a que já vem por tarefa não se soma de novo (o
 * `gravarInstrucoesDaProgramacao` também a pula).
 */
export async function instrucoesDoPedido(db: LeitorDaProgramacao, dto: CreateProgramacaoDto): Promise<string[]> {
  const tarefasIds = (dto.tarefas_ids ?? []).map((id) => id?.trim()).filter(Boolean);
  const tarefas = tarefasIds.length
    ? await db.tarefas.findMany({ where: { id: { in: variantesDeIds(tarefasIds) } }, select: { id: true, instrucao_id: true } })
    : [];
  const daTarefa = new Map(tarefas.map((t) => [t.id.trim(), t.instrucao_id?.trim()]));
  const pelasTarefas = tarefasIds.map((id) => daTarefa.get(id)).filter((id): id is string => !!id);
  const avulsas = (dto.instrucoes_ids ?? (await instrucoesDaOrigem(db, origemDaProgramacao(dto)))).map((id) => id?.trim()).filter(Boolean);
  return [...pelasTarefas, ...[...new Set(avulsas)].filter((id) => !pelasTarefas.includes(id))];
}

import { linhaDoMaquinario, linhaDoRecurso } from '@/modules/instrucoes/custo-da-instrucao';
import { variantesDeIds } from '@/modules/tarefas/ids';
import { type Cenario, type Pessoa, type Planta, pessoa } from '../cenario';
import { INSTRUCOES } from '../dados/instrucoes';
import { RECURSOS } from '../dados/recursos';

/**
 * O planejado que o planejador monta para a programação, pelas instruções
 * dela: a mesma conta da tela (front: recursos-das-instrucoes.ts), somando a
 * contribuição de cada linha (uma por tarefa ou instrução acrescentada), e a
 * equipe escalada entre os técnicos da planta. Gente de fora não cadastrada
 * entra como vaga com nome livre (decisão do usuário: a capacidade fica sem).
 */
export interface Planejado {
  tecnicos: Array<{ especialidade: string; horas_estimadas: number; custo_hora?: number; tecnico_id?: string; nome?: string }>;
  materiais: Array<{ descricao: string; quantidade_planejada: number; unidade: string; custo_unitario?: number }>;
  ferramentas: Array<{ descricao: string; quantidade: number; unidade?: string }>;
  itens_orcamento: Array<{ descricao: string; valor: number }>;
  /** As pessoas cadastradas da equipe (vão no início da OS) */
  equipe: Pessoa[];
  /** Horas de relógio da execução (a vaga mais longa) */
  duracaoHoras: number;
  /** Dias de campo (a instrução de vários dias, como a análise de 7 dias) */
  dias: number;
  horasDeEquipe: number;
}

const casas = (x: number, n: number) => Math.round((x + Number.EPSILON) * 10 ** n) / 10 ** n;
const ROTULO: Record<string, string> = { INSTRUMENTO: 'Instrumento', VEICULO: 'Veículo', TERCEIRO: 'Terceiro', DESPESA_CAMPO: 'Despesa de campo' };
/** Uma pessoa trabalha até 9 h no dia; acima disso a vaga vira mais gente */
const HORAS_POR_PESSOA = 9;

/**
 * As linhas de recurso e de maquinário das instruções, por consulta própria e
 * nunca por `include`: `instrucoes.id` é VarChar com o cuid de 25 caracteres, e
 * `instrucao_recursos.instrucao_id` é Char(26) com espaço no fim. O Prisma casa
 * pai e filho em JavaScript e o include voltava vazio: um ano de OS planejadas
 * sem técnico e sem material (achado da revisão do SN-70).
 */
async function linhasDasInstrucoes(c: Cenario, ids: string[]) {
  const [recursos, maquinarios] = await Promise.all([
    c.prisma.instrucao_recursos.findMany({ where: { instrucao_id: { in: variantesDeIds(ids) } }, include: { recurso: true } }),
    c.prisma.instrucao_maquinarios.findMany({ where: { instrucao_id: { in: variantesDeIds(ids) } }, include: { maquinario: true } }),
  ]);
  const porInstrucao = <T extends { instrucao_id: string }>(linhas: T[]) => {
    const mapa = new Map<string, T[]>();
    for (const linha of linhas) mapa.set(linha.instrucao_id.trim(), [...(mapa.get(linha.instrucao_id.trim()) ?? []), linha]);
    return mapa;
  };
  return { recursos: porInstrucao(recursos), maquinarios: porInstrucao(maquinarios) };
}

/** As instruções da programação, com quantas linhas cada uma tem (uma por tarefa ou avulsa) */
async function instrucoesDaProgramacao(c: Cenario, programacaoId: string): Promise<Map<string, number>> {
  const linhas = await c.prisma.tarefas_programacao_os.findMany({
    where: { programacao_id: programacaoId },
    select: { tarefa_id: true, instrucao_id: true },
  });
  const tarefaIds = linhas.map((l) => l.tarefa_id?.trim()).filter((id): id is string => !!id);
  const tarefas = tarefaIds.length
    ? await c.prisma.tarefas.findMany({ where: { id: { in: variantesDeIds(tarefaIds) } }, select: { id: true, instrucao_id: true } })
    : [];
  const instrucaoDaTarefa = new Map(tarefas.map((t) => [t.id.trim(), t.instrucao_id?.trim()]));
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const id = linha.instrucao_id?.trim() || (linha.tarefa_id ? instrucaoDaTarefa.get(linha.tarefa_id.trim()) : undefined);
    if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }
  return contagem;
}

export async function planejar(c: Cenario, programacaoId: string, planta: Planta): Promise<Planejado> {
  const contagem = await instrucoesDaProgramacao(c, programacaoId);
  const instrucoes = await c.prisma.instrucoes.findMany({ where: { id: { in: variantesDeIds([...contagem.keys()]) } }, select: { id: true, codigo: true } });
  const linhas = await linhasDasInstrucoes(c, instrucoes.map((i) => i.id.trim()));

  const maoDeObra = new Map<string, { horas: number; pessoas: number; preco: number | null }>();
  const materiais = new Map<string, { quantidade: number; unidade: string; preco: number | null }>();
  const ferramentas = new Map<string, { quantidade: number; unidade?: string }>();
  const orcamento = new Map<string, number>();
  const somarNoOrcamento = (descricao: string, valor: number | null) => {
    if (valor == null || valor <= 0) return;
    orcamento.set(descricao, casas((orcamento.get(descricao) ?? 0) + valor, 2));
  };
  let dias = 1;

  for (const inst of instrucoes) {
    const vezes = contagem.get(inst.id.trim()) ?? 1;
    const dados = INSTRUCOES.find((i) => i.codigo === inst.codigo?.trim());
    dias = Math.max(dias, dados?.duracao_dias && dados.duracao_dias > 2 ? dados.duracao_dias : 1);
    for (const linha of linhas.recursos.get(inst.id.trim()) ?? []) {
      const custo = linhaDoRecurso(linha);
      const nome = linha.recurso.nome.trim();
      const quantidade = Number(linha.quantidade ?? 0) || 1;
      switch (linha.recurso.categoria) {
        case 'MAO_DE_OBRA': {
          const atual = maoDeObra.get(nome) ?? { horas: 0, pessoas: 0, preco: custo.preco_base };
          atual.horas += vezes * quantidade * Number(linha.duracao_horas ?? 0);
          atual.pessoas = Math.max(atual.pessoas, Math.ceil(quantidade));
          maoDeObra.set(nome, atual);
          break;
        }
        case 'MATERIAL': {
          const atual = materiais.get(nome) ?? { quantidade: 0, unidade: linha.recurso.unidade?.trim() || 'un', preco: custo.preco_base };
          atual.quantidade += vezes * quantidade * (1 + Number(linha.fator_perda ?? 0));
          materiais.set(nome, atual);
          break;
        }
        case 'INSTRUMENTO':
          // O instrumento vai uma vez e serve a OS inteira: a diária é a do dia de campo
          ferramentas.set(nome, { quantidade: 1, unidade: linha.recurso.unidade?.trim() || undefined });
          if (custo.preco_base != null) {
            const horasDeUso = Math.min(vezes * Number(linha.duracao_horas ?? 0), dias * 24);
            const diarias = Math.max(1, Math.ceil(horasDeUso / Math.max(custo.horas_por_diaria, 1)));
            orcamento.set(`${ROTULO.INSTRUMENTO}: ${nome}`, Math.max(orcamento.get(`${ROTULO.INSTRUMENTO}: ${nome}`) ?? 0, casas(diarias * custo.preco_base, 2)));
          }
          break;
        default:
          somarNoOrcamento(`${ROTULO[linha.recurso.categoria] ?? linha.recurso.categoria}: ${nome}`, custo.subtotal == null ? null : vezes * custo.subtotal);
      }
    }
    for (const linha of linhas.maquinarios.get(inst.id.trim()) ?? []) {
      const custo = linhaDoMaquinario(linha);
      const nome = linha.maquinario.nome.trim();
      ferramentas.set(nome, { quantidade: Math.max(ferramentas.get(nome)?.quantidade ?? 0, Number(linha.quantidade ?? 1) || 1) });
      // A máquina alugada vem uma vez por OS
      if (custo.subtotal != null) orcamento.set(`Maquinário: ${nome}`, Math.max(orcamento.get(`Maquinário: ${nome}`) ?? 0, custo.subtotal));
    }
  }

  // Corretiva sem instrução (o operador não indicou nenhuma): o planejador manda alguém para o diagnóstico
  if (maoDeObra.size === 0) {
    const diagnostico = RECURSOS.find((r) => r.nome === 'Eletricista de manutenção');
    maoDeObra.set('Eletricista de manutenção', { horas: 2, pessoas: 1, preco: diagnostico?.preco_unitario ?? null });
  }

  // A equipe: técnicos da planta primeiro; engenheiro é a planejadora; o resto, gente de fora
  const daPlanta = planta.dados.tecnicos.map((k) => pessoa(c, k));
  const livres = [...daPlanta];
  const equipe: Pessoa[] = [];
  const tecnicos: Planejado['tecnicos'] = [];
  let duracaoHoras = 1;
  let horasDeEquipe = 0;
  for (const [especialidade, mo] of maoDeObra) {
    if (mo.horas <= 0) continue;
    horasDeEquipe += mo.horas;
    const porDia = mo.horas / dias;
    const pessoas = Math.max(mo.pessoas, Math.ceil(porDia / HORAS_POR_PESSOA));
    const horasDaVaga = Math.min(24, Math.max(0.25, Math.ceil((mo.horas / pessoas) * 4) / 4));
    duracaoHoras = Math.max(duracaoHoras, Math.min(horasDaVaga / dias, HORAS_POR_PESSOA));
    for (let i = 0; i < pessoas; i++) {
      const vaga = { especialidade, horas_estimadas: horasDaVaga, ...(mo.preco != null && { custo_hora: mo.preco }) };
      if (especialidade === 'Engenheiro eletricista') {
        const engenheira = pessoa(c, 'renata');
        tecnicos.push({ ...vaga, tecnico_id: engenheira.id });
        if (!equipe.includes(engenheira)) equipe.push(engenheira);
        continue;
      }
      const alguem = livres.shift();
      if (alguem) {
        tecnicos.push({ ...vaga, tecnico_id: alguem.id });
        equipe.push(alguem);
      } else {
        tecnicos.push({ ...vaga, nome: especialidade === 'Auxiliar de manutenção' ? 'Auxiliar terceirizado (Limpa Solar)' : `${especialidade} (apoio terceirizado)` });
      }
    }
  }

  // Deslocamento e diárias: a planta longe pede alimentação e, em vários dias, hospedagem
  const pessoasNaViagem = Math.max(tecnicos.length, 1);
  const veiculo = planta.dados.distanciaKm > 150 ? 'Picape 4x4' : 'Veículo utilitário';
  const precoDoKm = (await c.prisma.recursos.findFirst({ where: { nome: veiculo }, select: { preco_unitario: true } }))?.preco_unitario;
  if (precoDoKm != null) somarNoOrcamento(`${ROTULO.VEICULO}: ${veiculo}`, casas(planta.dados.distanciaKm * Number(precoDoKm), 2));
  if (planta.dados.distanciaKm > 300) {
    somarNoOrcamento(`${ROTULO.DESPESA_CAMPO}: Diária de alimentação`, pessoasNaViagem * dias * 78);
    if (dias > 1 || duracaoHoras > 6) somarNoOrcamento(`${ROTULO.DESPESA_CAMPO}: Hospedagem`, pessoasNaViagem * Math.max(1, dias - 1) * 230);
  }

  return {
    tecnicos,
    materiais: [...materiais].map(([descricao, m]) => {
      const quantidade = Math.max(Math.ceil(m.quantidade * 1000 - 1e-6) / 1000, 0.001);
      return { descricao, quantidade_planejada: quantidade, unidade: m.unidade, ...(m.preco != null && { custo_unitario: casas(m.preco, 2) }) };
    }),
    ferramentas: [...ferramentas].map(([descricao, f]) => ({ descricao, quantidade: f.quantidade, ...(f.unidade && { unidade: f.unidade }) })),
    itens_orcamento: [...orcamento].map(([descricao, valor]) => ({ descricao, valor })),
    equipe,
    duracaoHoras: casas(Math.max(duracaoHoras, 1), 2),
    dias,
    horasDeEquipe: casas(horasDeEquipe, 2),
  };
}

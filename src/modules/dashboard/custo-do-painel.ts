import { Prisma, PrismaService } from '@/core';
import { naturezaDoItem } from '../execucao-os/natureza-do-custo';
import { resumoDoCusto } from '../execucao-os/resumo-do-custo';
import { fimDaOrdem, indiceDoMes, type JanelaDoPainel, type OrdemDoPainel } from './recorte-do-painel';

/**
 * O custo do painel por natureza (SN-81): mão de obra, material e outros custos
 * (decisão do usuário, 20/out/2026). Antes o total era dividido em 55/30/15 e
 * marcado "simulado".
 *
 * Sai das LINHAS da OS, pela conta do resumo do custo da OS (SN-93,
 * `resumo-do-custo.ts`), a mesma do custo real gravado, do sheet e do PDF. Os
 * outros custos (o campo ainda se chama `adicionais`: a tela e a planilha o
 * leem) são os itens do orçamento — veículo, hospedagem, instrumentos —, pelo
 * real conferido ou pelo previsto, os não previstos e os adicionais de antes do
 * SN-93. O `custo_real` gravado pode estar atrasado em relação às linhas: o
 * calculado antes do SN-61 (sem o material consumido), o consumo registrado
 * depois do executar e o de antes do SN-93 (sem os outros custos). A linha é o
 * que aconteceu; as OS em que os dois diferem entram na base.
 */
export interface CustoDaOrdem {
  maoDeObra: number;
  material: number;
  /** Os outros custos (SN-93); o nome é o que a tela lê */
  adicionais: number;
  total: number;
  /** O `custo_real` gravado difere das linhas (vale a linha) */
  divergente: boolean;
  /** Horas trabalhadas de técnico sem custo/hora (entram como R$ 0) */
  horasSemPreco: number;
  /** Materiais consumidos sem custo unitário (entram como R$ 0) */
  materiaisSemPreco: number;
}

/** O custo de cada OS, pelo id */
export type CustosDoPainel = Map<string, CustoDaOrdem>;

interface LinhaDeMaterial {
  os_id: string;
  custo_unitario: Prisma.Decimal | null;
  quantidade_consumida: Prisma.Decimal | null;
}

interface LinhaDeTecnico {
  os_id: string;
  custo_hora: Prisma.Decimal | null;
  horas_trabalhadas: Prisma.Decimal | null;
  horas_estimadas: Prisma.Decimal;
}

interface LinhaDeOutroCusto {
  os_id: string;
  natureza: string;
  valor: Prisma.Decimal;
  valor_real: Prisma.Decimal | null;
  nao_previsto: boolean;
}

const numeroOuNulo = (v: Prisma.Decimal | null) => (v === null ? null : v.toNumber());

const porOS = <T extends { os_id: string }>(linhas: T[]) => {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) mapa.set(l.os_id.trim(), [...(mapa.get(l.os_id.trim()) ?? []), l]);
  return mapa;
};

/**
 * As linhas de material e de técnico das OS, numa consulta por tabela. `= ANY`
 * com um parâmetro só: com `IN (...)`, milhares de OS estouravam o limite de bind.
 */
export async function custosDasOrdens(prisma: PrismaService, ordens: OrdemDoPainel[]): Promise<CustosDoPainel> {
  const porOrdem: CustosDoPainel = new Map();
  if (ordens.length === 0) return porOrdem;

  const ids = ordens.map((o) => o.id);
  const [materiais, tecnicos, outros, regraAntiga] = await Promise.all([
    prisma.$queryRaw<LinhaDeMaterial[]>`
      SELECT os_id, custo_unitario, quantidade_consumida FROM materiais_os WHERE os_id = ANY(${ids}::text[])`,
    prisma.$queryRaw<LinhaDeTecnico[]>`
      SELECT os_id, custo_hora, horas_trabalhadas, horas_estimadas FROM tecnicos_os WHERE os_id = ANY(${ids}::text[])`,
    prisma.$queryRaw<LinhaDeOutroCusto[]>`
      SELECT os_id, natureza, valor, valor_real, nao_previsto FROM itens_orcamento_os WHERE os_id = ANY(${ids}::text[])`,
    // A finalizada pelas regras de antes do SN-93 (conteúdo da versão 1, ou sem código): o sheet e o PDF
    // dela deixam os outros custos fora do total, e o painel diz o mesmo número
    prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM ordens_servico
       WHERE id = ANY(${ids}::text[]) AND status = 'FINALIZADA'
         AND coalesce(conteudo_finalizado->>'versao', '0') NOT IN ('2')`,
  ]);
  const daRegraAntiga = new Set(regraAntiga.map((o) => o.id.trim()));
  const materiaisDa = porOS(materiais);
  const tecnicosDa = porOS(tecnicos);
  const outrosDa = porOS(outros);

  for (const o of ordens) {
    const chave = o.id.trim();
    const resumo = resumoDoCusto({
      equipe: (tecnicosDa.get(chave) ?? []).map((t) => ({
        nome: null,
        especialidade: '',
        horas_estimadas: t.horas_estimadas.toNumber(),
        horas_trabalhadas: numeroOuNulo(t.horas_trabalhadas),
        custo_hora: numeroOuNulo(t.custo_hora),
      })),
      materiais: (materiaisDa.get(chave) ?? []).map((m) => ({
        descricao: '',
        unidade: '',
        quantidade_planejada: 0,
        quantidade_consumida: numeroOuNulo(m.quantidade_consumida),
        custo_unitario: numeroOuNulo(m.custo_unitario),
      })),
      outros: (outrosDa.get(chave) ?? []).map((i) => ({
        descricao: '',
        natureza: naturezaDoItem(i.natureza),
        previsto: i.valor.toNumber(),
        real: numeroOuNulo(i.valor_real),
        nao_previsto: i.nao_previsto,
      })),
      custos_adicionais: numeroOuNulo(o.custos_adicionais),
      instrucoes: [],
      orcamento_previsto: null,
      // O outro custo não conferido entra pelo previsto; na finalizada pelas regras de antes, fica fora
      outros_no_real: !daRegraAntiga.has(chave),
    });
    const real = (natureza: string) => resumo.naturezas.find((l) => l.natureza === natureza)?.real ?? 0;
    const maoDeObra = new Prisma.Decimal(real('MAO_DE_OBRA'));
    const material = new Prisma.Decimal(real('MATERIAL'));
    const total = new Prisma.Decimal(resumo.real);

    porOrdem.set(o.id, {
      maoDeObra: maoDeObra.toNumber(),
      material: material.toNumber(),
      adicionais: total.sub(maoDeObra).sub(material).toNumber(),
      total: total.toNumber(),
      // O gravado diferente da conta: o consumo registrado depois de executar, o custo de antes do
      // SN-61, a OS executada antes do SN-93 que ainda não refez o custo (o `refazer-custo-real` do deploy)
      divergente: !total.equals(o.custo_real ?? 0),
      horasSemPreco: (tecnicosDa.get(chave) ?? [])
        .filter((t) => !t.custo_hora || t.custo_hora.isZero())
        .reduce((soma, t) => soma + (t.horas_trabalhadas ?? t.horas_estimadas).toNumber(), 0),
      materiaisSemPreco: (materiaisDa.get(chave) ?? []).filter(
        (m) => m.quantidade_consumida?.greaterThan(0) && (!m.custo_unitario || m.custo_unitario.isZero()),
      ).length,
    });
  }

  return porOrdem;
}

const emMil = (v: number) => Math.round(v / 100) / 10;
const numero = (v: Prisma.Decimal | null) => (v ? v.toNumber() : 0);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O custo de cada mês do período, por natureza, no mês em que a OS terminou */
export function montarCusto(concluidas: OrdemDoPainel[], custos: CustosDoPainel, janela: JanelaDoPainel) {
  const serie = () => new Array<number>(janela.meses.length).fill(0);
  const maoDeObra = serie();
  const material = serie();
  const adicionais = serie();
  const orcado = serie();

  let comCusto = 0;
  let divergentes = 0;
  let horasSemPreco = 0;
  let materiaisSemPreco = 0;
  for (const o of concluidas) {
    const i = indiceDoMes(fimDaOrdem(o), janela);
    if (i < 0) continue;
    const c = custos.get(o.id);
    if (c) {
      maoDeObra[i] += c.maoDeObra;
      material[i] += c.material;
      adicionais[i] += c.adicionais;
      if (c.total > 0) comCusto += 1;
      if (c.divergente) divergentes += 1;
      horasSemPreco += c.horasSemPreco;
      materiaisSemPreco += c.materiaisSemPreco;
    }
    orcado[i] += numero(o.orcamento_previsto);
  }

  const divergencia =
    divergentes > 0
      ? ` ${plural(divergentes, 'OS tem', 'OS têm')} o custo real gravado diferente da soma das linhas: o painel usa as linhas.`
      : '';

  // A hora ou o material sem preço entram como zero: a base diz quanto ficou de fora
  const semPreco = [
    horasSemPreco > 0 ? `${String(Math.round(horasSemPreco * 10) / 10).replace('.', ',')} h trabalhadas sem custo/hora` : '',
    materiaisSemPreco > 0 ? `${plural(materiaisSemPreco, 'material consumido', 'materiais consumidos')} sem custo unitário` : '',
  ].filter(Boolean);
  const foraDoCusto = semPreco.length > 0 ? ` Sem preço, fora do custo: ${semPreco.join(' e ')}.` : '';

  return {
    maoObra: maoDeObra.map(emMil),
    material: material.map(emMil),
    adicionais: adicionais.map(emMil),
    orcado: orcado.map(emMil),
    total: maoDeObra.map((v, i) => emMil(v + material[i] + adicionais[i])),
    formula:
      'Das OS concluídas, no mês em que terminaram. Mão de obra = custo/hora × horas trabalhadas de cada técnico (a estimada só na OS antiga, sem horas). Material = custo unitário × quantidade consumida. Outros custos = veículo, hospedagem, alimentação, instrumentos, maquinário e terceiros pelo valor conferido no Executar (o previsto quando não foi conferido), mais os não previstos lançados na OS. A OS finalizada antes de 22/10/2026 fica com a conta da época (só mão de obra e material), como no registro dela. Orçado = orçamento previsto das mesmas OS. Em R$ mil.',
    base: `${plural(concluidas.length, 'OS concluída', 'OS concluídas')} no período, ${comCusto} com custo.${divergencia}${foraDoCusto}`,
  };
}

/** O custo médio por OS concluída que teve custo, corretiva x as demais */
export function montarCustoPorOS(concluidas: OrdemDoPainel[], custos: CustosDoPainel, janela: JanelaDoPainel) {
  const serie = () => new Array<number>(janela.meses.length).fill(0);
  const soma = { corretiva: serie(), preventiva: serie() };
  const qtd = { corretiva: serie(), preventiva: serie() };

  let comCusto = 0;
  for (const o of concluidas) {
    const custo = custos.get(o.id)?.total ?? 0;
    if (!custo) continue;
    const i = indiceDoMes(fimDaOrdem(o), janela);
    if (i < 0) continue;

    comCusto += 1;
    const chave = o.tipo === 'CORRETIVA' ? 'corretiva' : 'preventiva';
    soma[chave][i] += custo;
    qtd[chave][i] += 1;
  }

  const media = (s: number[], q: number[]) => s.map((v, i) => (q[i] > 0 ? Math.round(v / q[i]) : 0));

  return {
    corretiva: media(soma.corretiva, qtd.corretiva),
    preventiva: media(soma.preventiva, qtd.preventiva),
    base: comCusto,
    pendencia: comCusto === 0 ? 'Nenhuma OS concluída tem custo lançado.' : undefined,
  };
}

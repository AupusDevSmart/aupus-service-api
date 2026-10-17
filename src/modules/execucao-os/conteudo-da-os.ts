import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { MARCOS_DO_TEMPO, minutosEfetivos } from './horas-da-execucao';

/**
 * O conteúdo registrado da OS e o código de verificação dele (SN-62).
 *
 * Ao finalizar, a API monta o conteúdo (o que a OS registrou: resultado,
 * tarefas, checklist e leituras, fotos pela soma do arquivo, dados de falha,
 * horas, materiais e ferramentas), grava junto com o SHA-256 dele, e o PDF sai
 * dessa cópia. Conferir o código refaz a conta sobre o que está no sistema: se
 * qualquer coisa mudou — um texto, uma leitura, o arquivo de uma foto —, não
 * confere, e a resposta diz em quê. Sem assinatura (decisão do usuário): o
 * código prova integridade, não autoria.
 *
 * Só entra o que é da OS (as cópias congeladas, os textos gravados nela): o
 * nome atual da planta ou do equipamento mudaria o código sem a OS ter mudado.
 * Nem os ids de cadastro (planta, equipamento, usuário do técnico): são FK com
 * ON UPDATE CASCADE / SET NULL, e trocar ou apagar o cadastro mudava a OS
 * finalizada sem ninguém mexer nela.
 *
 * As colunas que entram aqui NÃO mudam de tipo nem de precisão (timestamp(3)
 * para (0), Decimal de escala, char/varchar com espaço): o ALTER reescreve o
 * dado guardado, e o código de toda OS já finalizada deixaria de conferir.
 *
 * `versao` existe para o dia em que o conteúdo ganhar campo: a conta de uma OS
 * finalizada tem de ser refeita com as regras da versão dela, senão toda OS
 * antiga deixaria de conferir.
 */
export const VERSAO_DO_CONTEUDO = 1;

type Data = string | null;

export interface ConteudoDaOS {
  versao: typeof VERSAO_DO_CONTEUDO;
  os: {
    numero_os: string;
    tipo: string;
    prioridade: string;
    origem: string;
    descricao: string | null;
    local: string | null;
    ativo: string | null;
    condicoes: string | null;
    data_hora_programada: Data;
    data_hora_inicio_real: Data;
    data_hora_fim_real: Data;
    /** Do início ao fim sem as pausas, pela trilha da OS (SN-61) */
    tempo_efetivo_minutos: number | null;
    responsavel: string | null;
    resultado_servico: string | null;
    problemas_encontrados: string | null;
    recomendacoes: string | null;
    incidentes_seguranca: string | null;
    checklist_concluido: number | null;
    parada_inicio: Data;
    parada_fim: Data;
    falha_sintoma: string | null;
    falha_causa: string | null;
    falha_acao: string | null;
    custo_real: number | null;
    avaliacao_qualidade: number | null;
    observacoes_qualidade: string | null;
    aprovado_por: string | null;
    data_aprovacao: Data;
    finalizado_por: string | null;
    finalizada_em: Data;
  };
  tarefas: {
    id: string;
    nome: string | null;
    instrucao_tag: string | null;
    instrucao_nome: string | null;
    status: string;
    data_conclusao: Data;
    concluida_por: string | null;
    observacoes: string | null;
  }[];
  checklist: {
    id: string;
    tarefa_os_id: string | null;
    atividade: string;
    obrigatoria: boolean;
    concluida: boolean;
    concluida_em: Data;
    concluida_por: string | null;
    tipo: string;
    unidade: string | null;
    valor_minimo: number | null;
    valor_maximo: number | null;
    valor_lido: number | null;
    exige_foto: boolean;
    observacoes: string | null;
  }[];
  anexos: {
    id: string;
    nome_original: string;
    tipo: string;
    mime_type: string;
    tamanho: number;
    descricao: string | null;
    fase_execucao: string | null;
    tarefa_os_id: string | null;
    checklist_item_id: string | null;
    uploaded_at: Data;
    uploaded_by: string | null;
    /** SHA-256 do arquivo; null quando o arquivo não está no servidor (o PDF diz) */
    sha256: string | null;
  }[];
  equipe: {
    id: string;
    nome: string | null;
    especialidade: string;
    horas_estimadas: number;
    horas_trabalhadas: number | null;
    presente: boolean;
    custo_hora: number | null;
  }[];
  materiais: {
    id: string;
    descricao: string;
    unidade: string;
    quantidade_planejada: number;
    quantidade_consumida: number | null;
    custo_unitario: number | null;
    observacoes: string | null;
  }[];
  ferramentas: {
    id: string;
    descricao: string;
    quantidade: number;
    utilizada: boolean;
    condicao_antes: string | null;
    condicao_depois: string | null;
    observacoes: string | null;
  }[];
}

/** O que cada parte do conteúdo é, para dizer em que a OS mudou. */
export const PARTES_DO_CONTEUDO: Record<Exclude<keyof ConteudoDaOS, 'versao'>, string> = {
  os: 'dados da OS (resultado, falha, auditoria, datas)',
  tarefas: 'tarefas',
  checklist: 'checklist e leituras',
  anexos: 'fotos e documentos',
  equipe: 'equipe e horas',
  materiais: 'materiais',
  ferramentas: 'ferramentas',
};

const texto = (v: string | null | undefined) => v?.trim() || null;
const id = (v: string | null | undefined) => v?.trim() || null;
const data = (v: Date | null | undefined): Data => (v ? v.toISOString() : null);
const numero = (v: Prisma.Decimal | number | bigint | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** O conteúdo lido pelo client de uma transação (finalizar) ou pelo de fora (conferir). */
type Leitor = Pick<
  Prisma.TransactionClient,
  'ordens_servico' | 'tarefas_os' | 'checklist_atividades_os' | 'anexos_os' | 'tecnicos_os' | 'materiais_os' | 'ferramentas_os' | 'historico_os'
>;

/** SHA-256 do arquivo, lido em partes (os anexos vão a 10 MB); null se não está no disco. */
export async function somaDoArquivo(caminho: string): Promise<string | null> {
  if (!caminho || !existsSync(caminho)) return null;
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(caminho)
      .on('data', (parte) => hash.update(parte))
      .on('end', () => resolve())
      .on('error', reject);
  });
  return hash.digest('hex');
}

/** O anexo como a soma o lê: a gravada no upload e, sem ela, o caminho no disco */
export interface AnexoParaSomar {
  id: string;
  caminho_s3: string;
  sha256: string | null;
}
export type Somar = (anexo: AnexoParaSomar) => Promise<string | null>;

/**
 * A soma gravada no upload (SN-62); o anexo de antes dela, do disco. É a do
 * finalizar e do PDF: ler e somar todos os arquivos a cada pedido pesava no
 * disco e segurava a transação do finalizar.
 */
export const somaGravadaOuDoDisco: Somar = async (anexo) => anexo.sha256?.trim() || somaDoArquivo(anexo.caminho_s3);

/** A conferência relê o disco: é ela que pega o arquivo trocado depois do upload. */
export const somaDoDisco: Somar = (anexo) => somaDoArquivo(anexo.caminho_s3);

/**
 * Ordem por texto em JS, pelo código do caractere: o ORDER BY do Postgres segue
 * a collation do banco, e um restore noutra versão da glibc/ICU mudaria a ordem
 * dos empates — e o código de todas as OS finalizadas.
 */
const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const porNumeroEId = (a: { ordem: number; id: string }, b: { ordem: number; id: string }) => a.ordem - b.ordem || porTexto(a.id, b.id);
const porDataEId = <T extends { id: string }>(data: (x: T) => Date | null) => (a: T, b: T) =>
  (data(a)?.getTime() ?? 0) - (data(b)?.getTime() ?? 0) || porTexto(a.id, b.id);

export async function conteudoDaOS(prisma: Leitor, osId: string, somar: Somar = somaGravadaOuDoDisco): Promise<ConteudoDaOS> {
  const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId }, omit: { conteudo_finalizado: true } });
  const [tarefasLidas, checklistLido, anexosLidos, equipeLida, materiaisLidos, ferramentasLidas, marcos] = await Promise.all([
    prisma.tarefas_os.findMany({ where: { os_id: osId } }),
    prisma.checklist_atividades_os.findMany({ where: { os_id: osId } }),
    prisma.anexos_os.findMany({ where: { os_id: osId, deletado_em: null } }),
    prisma.tecnicos_os.findMany({ where: { os_id: osId } }),
    prisma.materiais_os.findMany({ where: { os_id: osId } }),
    prisma.ferramentas_os.findMany({ where: { os_id: osId } }),
    prisma.historico_os.findMany({ where: { os_id: osId, acao: { in: MARCOS_DO_TEMPO } }, select: { acao: true, data: true } }),
  ]);
  // Ordem estável em cada lista: a mesma OS tem de dar o mesmo texto, sempre
  const tarefas = [...tarefasLidas].sort(porNumeroEId);
  const checklist = [...checklistLido].sort(porNumeroEId);
  const anexos = [...anexosLidos].sort(porDataEId((a) => a.uploaded_at));
  const equipe = [...equipeLida].sort(porDataEId((t) => t.created_at));
  const materiais = [...materiaisLidos].sort(porDataEId((m) => m.created_at));
  const ferramentas = [...ferramentasLidas].sort(porDataEId((f) => f.created_at));

  // Um arquivo por vez: 50 fotos de 10 MB lidas juntas iriam para a memória juntas
  const somas: (string | null)[] = [];
  for (const anexo of anexos) somas.push(await somar(anexo));

  return {
    versao: VERSAO_DO_CONTEUDO,
    os: {
      numero_os: os.numero_os,
      tipo: os.tipo,
      prioridade: os.prioridade,
      origem: os.origem,
      descricao: texto(os.descricao),
      local: texto(os.local),
      ativo: texto(os.ativo),
      condicoes: texto(os.condicoes),
      data_hora_programada: data(os.data_hora_programada),
      data_hora_inicio_real: data(os.data_hora_inicio_real),
      data_hora_fim_real: data(os.data_hora_fim_real),
      tempo_efetivo_minutos: minutosEfetivos(os.data_hora_inicio_real, os.data_hora_fim_real, marcos),
      responsavel: texto(os.responsavel),
      resultado_servico: texto(os.resultado_servico),
      problemas_encontrados: texto(os.problemas_encontrados),
      recomendacoes: texto(os.recomendacoes),
      incidentes_seguranca: texto(os.incidentes_seguranca),
      checklist_concluido: numero(os.checklist_concluido),
      parada_inicio: data(os.parada_inicio),
      parada_fim: data(os.parada_fim),
      falha_sintoma: texto(os.falha_sintoma),
      falha_causa: texto(os.falha_causa),
      falha_acao: texto(os.falha_acao),
      custo_real: numero(os.custo_real),
      avaliacao_qualidade: numero(os.avaliacao_qualidade),
      observacoes_qualidade: texto(os.observacoes_qualidade),
      aprovado_por: texto(os.aprovado_por),
      data_aprovacao: data(os.data_aprovacao),
      finalizado_por: texto(os.finalizado_por),
      finalizada_em: data(os.finalizada_em),
    },
    tarefas: tarefas.map((t) => ({
      id: t.id.trim(),
      nome: texto(t.nome_snapshot),
      instrucao_tag: texto(t.instrucao_tag),
      instrucao_nome: texto(t.instrucao_nome),
      status: t.status,
      data_conclusao: data(t.data_conclusao),
      concluida_por: texto(t.concluida_por),
      observacoes: texto(t.observacoes),
    })),
    checklist: checklist.map((c) => ({
      id: c.id.trim(),
      tarefa_os_id: id(c.tarefa_os_id),
      atividade: c.atividade.trim(),
      obrigatoria: c.obrigatoria,
      concluida: c.concluida,
      concluida_em: data(c.concluida_em),
      concluida_por: texto(c.concluida_por),
      tipo: c.tipo,
      unidade: texto(c.unidade),
      valor_minimo: numero(c.valor_minimo),
      valor_maximo: numero(c.valor_maximo),
      valor_lido: numero(c.valor_lido),
      exige_foto: c.exige_foto,
      observacoes: texto(c.observacoes),
    })),
    anexos: anexos.map((a, i) => ({
      id: a.id.trim(),
      nome_original: a.nome_original,
      tipo: a.tipo,
      mime_type: a.mime_type,
      tamanho: Number(a.tamanho),
      descricao: texto(a.descricao),
      fase_execucao: texto(a.fase_execucao),
      tarefa_os_id: id(a.tarefa_os_id),
      checklist_item_id: id(a.checklist_item_id),
      uploaded_at: data(a.uploaded_at),
      uploaded_by: texto(a.uploaded_by),
      sha256: somas[i],
    })),
    equipe: equipe.map((t) => ({
      id: t.id.trim(),
      nome: texto(t.nome),
      especialidade: t.especialidade.trim(),
      horas_estimadas: Number(t.horas_estimadas),
      horas_trabalhadas: numero(t.horas_trabalhadas),
      presente: t.presente,
      custo_hora: numero(t.custo_hora),
    })),
    materiais: materiais.map((m) => ({
      id: m.id.trim(),
      descricao: m.descricao.trim(),
      unidade: m.unidade.trim(),
      quantidade_planejada: Number(m.quantidade_planejada),
      quantidade_consumida: numero(m.quantidade_consumida),
      custo_unitario: numero(m.custo_unitario),
      observacoes: texto(m.observacoes),
    })),
    ferramentas: ferramentas.map((f) => ({
      id: f.id.trim(),
      descricao: f.descricao.trim(),
      quantidade: Number(f.quantidade),
      utilizada: f.utilizada,
      condicao_antes: texto(f.condicao_antes),
      condicao_depois: texto(f.condicao_depois),
      observacoes: texto(f.observacoes),
    })),
  };
}

/**
 * JSON com as chaves em ordem: o mesmo conteúdo dá o mesmo texto, venha da
 * memória ou do JSONB (que guarda as chaves na ordem dele).
 */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  const chaves = Object.keys(objeto).filter((k) => objeto[k] !== undefined).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(objeto[k])}`).join(',')}}`;
}

export const codigoDoConteudo = (conteudo: ConteudoDaOS) => createHash('sha256').update(jsonCanonico(conteudo), 'utf8').digest('hex');

/** O código como a pessoa cola: com espaços, traços, maiúsculas. Null se não for um código. */
export function codigoDigitado(texto: string | null | undefined): string | null {
  const limpo = (texto ?? '').toLowerCase().replace(/[\s-]/g, '');
  return /^[0-9a-f]{64}$/.test(limpo) ? limpo : null;
}

/** As partes em que o conteúdo de agora difere do finalizado. */
export function diferencasDoConteudo(finalizado: ConteudoDaOS, atual: ConteudoDaOS): string[] {
  return (Object.keys(PARTES_DO_CONTEUDO) as (keyof typeof PARTES_DO_CONTEUDO)[])
    .filter((parte) => jsonCanonico(finalizado[parte]) !== jsonCanonico(atual[parte]))
    .map((parte) => PARTES_DO_CONTEUDO[parte]);
}

/** O conteúdo gravado no JSONB, se tem a forma de um (versão conhecida). */
export function conteudoGravado(valor: Prisma.JsonValue | null): ConteudoDaOS | null {
  const objeto = valor as { versao?: unknown } | null;
  return objeto && typeof objeto === 'object' && objeto.versao === VERSAO_DO_CONTEUDO ? (valor as unknown as ConteudoDaOS) : null;
}

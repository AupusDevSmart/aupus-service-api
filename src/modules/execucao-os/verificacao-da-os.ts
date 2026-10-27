import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  codigoDigitado,
  codigoDoConteudo,
  conteudoDaOS,
  conteudoGravado,
  diferencasDoConteudo,
  somaDoArquivo,
  somaDoDisco,
  somaGravadaOuDoDisco,
  VERSAO_DO_CONTEUDO,
  type ConteudoDaOS,
  type Somar,
} from './conteudo-da-os';
import { complementoDaVersao1, dadosDoCustoDoConteudo } from './dados-do-custo';
import { comOCustoRegistrado, resumoDoCusto, type ResumoDoCusto } from './resumo-do-custo';

/**
 * O PDF da OS e a conferência do código (SN-62). A conta do conteúdo e do
 * código fica em `conteudo-da-os.ts`; aqui, quando ela é gravada e lida.
 */

/**
 * O conteúdo como o PDF o usa. Inteiro desde o SN-93 (D3: o PDF mostra o
 * valor/hora de cada pessoa e o custo unitário de cada material); na versão 1,
 * com o equipamento de cada tarefa lido do sistema na emissão (fora do código,
 * como os nomes da planta e da instalação).
 */
export type ConteudoDoPdf = ConteudoDaOS;

export interface RelatorioDaOS {
  os_id: string;
  numero_os: string;
  status: string;
  /** Null antes de finalizar (prévia) e nas OS finalizadas antes do código existir */
  codigo: string | null;
  finalizada_em: string | null;
  /** A OS ainda não foi finalizada: o documento é prévia, sem código */
  previa: boolean;
  conteudo: ConteudoDoPdf;
  /**
   * SN-93: o custo aberto, pela mesma conta do sheet e do custo real gravado.
   * Null para quem não gerencia a OS (SERV-9): ver `semOsCustos`
   */
  custos: ResumoDoCusto | null;
}

export interface ConferenciaDoCodigo {
  os_id: string;
  numero_os: string;
  finalizada_em: string | null;
  finalizado_por: string | null;
  /** O conteúdo de agora é o da finalização */
  confere: boolean;
  /** Em que mudou (vazio quando confere) */
  diferencas: string[];
  /** Os anexos que mudaram, um por um: "não confere: fotos" sozinho não diz qual */
  anexos: string[];
  conferido_em: string;
}

/** O relatório existe a partir de executada: antes não há o que relatar. */
const COM_RELATORIO = new Set(['EXECUTADA', 'AUDITADA', 'FINALIZADA']);

const NAO_ENCONTRADO = 'Código não encontrado: confira se foi copiado inteiro (64 letras e números).';

type Cliente = Pick<
  Prisma.TransactionClient,
  | 'ordens_servico'
  | 'tarefas_os'
  | 'checklist_atividades_os'
  | 'anexos_os'
  | 'tecnicos_os'
  | 'materiais_os'
  | 'ferramentas_os'
  | 'historico_os'
  | 'itens_orcamento_os'
  | 'instrucao_recursos'
  | 'instrucao_maquinarios'
  | 'tarefas'
  | 'instrucoes'
>;

/**
 * A soma dos anexos de antes do SN-62 (sem a soma gravada no upload), lida do
 * disco antes da transação do finalizar: lá dentro ela segurava a OS, a
 * programação, a origem e as tarefas do plano enquanto lia arquivo por arquivo.
 */
export async function somasDosAnexosSemSoma(prisma: Pick<Prisma.TransactionClient, 'anexos_os'>, osId: string): Promise<Map<string, string | null>> {
  const antigos = await prisma.anexos_os.findMany({ where: { os_id: osId, deletado_em: null, sha256: null }, select: { id: true, caminho_s3: true } });
  const somas = new Map<string, string | null>();
  for (const anexo of antigos) somas.set(anexo.id, await somaDoArquivo(anexo.caminho_s3));
  return somas;
}

/**
 * Na transação do finalizar, depois de tudo o que ela grava na OS. Devolve o
 * nome dos anexos sem arquivo no disco (ficam no conteúdo sem soma): quem
 * finaliza deixa na trilha, em vez de congelar a falta calada.
 */
export async function gravarCodigoDeVerificacao(tx: Cliente, osId: string, somasAntigas = new Map<string, string | null>()): Promise<string[]> {
  const somar: Somar = (anexo) => (somasAntigas.has(anexo.id) ? Promise.resolve(somasAntigas.get(anexo.id)!) : somaGravadaOuDoDisco(anexo));
  const conteudo = await conteudoDaOS(tx, osId, somar);
  await tx.ordens_servico.update({
    where: { id: osId },
    data: { codigo_verificacao: codigoDoConteudo(conteudo), conteudo_finalizado: conteudo as unknown as Prisma.InputJsonObject },
  });
  return conteudo.anexos.filter((a) => !a.sha256).map((a) => a.nome_original);
}

/**
 * O conteúdo e o custo como o PDF os usa. Na versão 1, o que ela não registrou
 * (os outros custos, o equipamento e o valor de cada tarefa) vem do sistema na
 * emissão e fica fora do total: o código prova o registro, não o complemento.
 */
async function paraOPdf(prisma: Cliente, osId: string, conteudo: ConteudoDaOS): Promise<Pick<RelatorioDaOS, 'conteudo' | 'custos'>> {
  const complemento = await complementoDaVersao1(prisma, osId);
  const custos = resumoDoCusto(dadosDoCustoDoConteudo(conteudo, complemento));
  if (conteudo.versao >= 2) return { conteudo, custos };
  return {
    conteudo: {
      ...conteudo,
      tarefas: conteudo.tarefas.map((t) => ({ ...t, equipamento: complemento.tarefas.get(t.id)?.equipamento ?? null })),
    },
    // A conta pelas linhas pode não ser o custo real que o registro guarda (e que o código prova)
    custos: comOCustoRegistrado(custos, conteudo.os.custo_real),
  };
}

/**
 * Cada anexo que difere: excluído, acrescentado, arquivo diferente ou fora do
 * servidor. Sem isto, a pasta da API movida de lugar e uma foto trocada davam
 * o mesmo "não confere: fotos e documentos".
 */
export function anexosQueMudaram(finalizado: ConteudoDaOS['anexos'], atual: ConteudoDaOS['anexos']): string[] {
  const agora = new Map(atual.map((a) => [a.id, a]));
  const antes = new Set(finalizado.map((a) => a.id));
  const mudancas = finalizado.flatMap((a) => {
    const hoje = agora.get(a.id);
    if (!hoje) return [`${a.nome_original}: excluído depois da finalização`];
    if (hoje.sha256 === a.sha256) return [];
    if (!hoje.sha256) return [`${a.nome_original}: o arquivo não está no servidor`];
    if (!a.sha256) return [`${a.nome_original}: não estava no servidor na finalização`];
    return [`${a.nome_original}: o arquivo é diferente do registrado`];
  });
  return [...mudancas, ...atual.filter((a) => !antes.has(a.id)).map((a) => `${a.nome_original}: acrescentado depois da finalização`)];
}

export async function relatorioDaOS(prisma: Cliente, id: string): Promise<RelatorioDaOS> {
  const os = await prisma.ordens_servico.findFirst({
    where: { id, deletado_em: null },
    select: { id: true, numero_os: true, status: true, codigo_verificacao: true, conteudo_finalizado: true, finalizada_em: true },
  });
  if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
  if (!COM_RELATORIO.has(os.status)) {
    throw new ConflictException('O relatório da OS sai a partir de executada.');
  }

  const base = { os_id: os.id.trim(), numero_os: os.numero_os, status: os.status, finalizada_em: os.finalizada_em?.toISOString() ?? null };
  // A cópia gravada só vale na OS finalizada
  if (os.status === 'FINALIZADA' && os.codigo_verificacao) {
    const codigo = os.codigo_verificacao.trim();
    const gravado = conteudoGravado(os.conteudo_finalizado);
    // Código sem conteúdo legível não pode virar PDF do conteúdo de agora com o código antigo
    if (!gravado) throw new InternalServerErrorException(`O conteúdo finalizado da OS ${os.numero_os} não pôde ser lido.`);
    // A cópia mexida não vira PDF com o código original (a conta não lê arquivo: é barata)
    if (codigoDoConteudo(gravado) !== codigo) {
      throw new ConflictException(`O conteúdo guardado da OS ${os.numero_os} não confere com o código dela: o PDF não pode ser emitido.`);
    }
    return { ...base, codigo, previa: false, ...(await paraOPdf(prisma, os.id, gravado)) };
  }
  // Antes de finalizar (prévia), ou finalizada antes do código existir: o de agora, sem código. A
  // finalizada pelas regras de antes do SN-93: o custo real dela não tinha os outros custos
  const versao = os.status === 'FINALIZADA' ? 1 : VERSAO_DO_CONTEUDO;
  const conteudo = await conteudoDaOS(prisma, os.id, somaGravadaOuDoDisco, versao);
  return { ...base, codigo: null, previa: os.status !== 'FINALIZADA', ...(await paraOPdf(prisma, os.id, conteudo)) };
}

/**
 * O relatório de quem não gerencia a OS — técnico de campo e cliente (SERV-9):
 * sem dinheiro nenhum (custo real, orçamento, valor de cada tarefa, valor/hora
 * de cada pessoa, custo unitário de cada material e os outros custos). As horas
 * e as quantidades ficam: são o registro da execução. O código continua o da OS
 * inteira — ele prova o registro gravado, não o documento entregue.
 */
export function semOsCustos(relatorio: RelatorioDaOS): RelatorioDaOS {
  const { conteudo } = relatorio;
  const { orcamento_previsto: _orcamento, custos_adicionais: _adicionais, ...os } = conteudo.os;
  const { outros_custos: _outros, ...resto } = conteudo;
  return {
    ...relatorio,
    custos: null,
    conteudo: {
      ...resto,
      os: { ...os, custo_real: null },
      tarefas: conteudo.tarefas.map(({ valor: _valor, valor_original: _original, ...tarefa }) => tarefa),
      equipe: conteudo.equipe.map((pessoa) => ({ ...pessoa, custo_hora: null })),
      materiais: conteudo.materiais.map((material) => ({ ...material, custo_unitario: null })),
    },
  };
}

/**
 * O código colado leva à OS dele, e o conteúdo é refeito sobre o que está no
 * sistema agora — os arquivos relidos do disco: é aqui que a foto trocada
 * depois do upload aparece. Fora do escopo de quem confere, o código "não
 * existe" — como qualquer id fora do escopo.
 */
export async function conferirCodigo(
  prisma: Cliente,
  texto: string,
  conferirEscopo: (osId: string) => Promise<void>,
): Promise<ConferenciaDoCodigo> {
  const codigo = codigoDigitado(texto);
  if (!codigo) throw new BadRequestException('O código de verificação tem 64 letras e números (0 a 9 e a a f).');

  const os = await prisma.ordens_servico.findFirst({
    where: { codigo_verificacao: codigo, deletado_em: null },
    select: { id: true, numero_os: true, status: true, conteudo_finalizado: true, finalizada_em: true, finalizado_por: true },
  });
  if (!os) throw new NotFoundException(NAO_ENCONTRADO);
  try {
    await conferirEscopo(os.id);
  } catch (erro) {
    // Só a recusa do escopo vira "não encontrado"; outro erro sobe como é
    if (erro instanceof ForbiddenException || erro instanceof NotFoundException) throw new NotFoundException(NAO_ENCONTRADO);
    throw erro;
  }

  const gravado = conteudoGravado(os.conteudo_finalizado);
  // Refeito com as regras da versão da OS: a conta de hoje daria outro texto para a OS da versão 1
  const atual = await conteudoDaOS(prisma, os.id, somaDoDisco, gravado?.versao ?? VERSAO_DO_CONTEUDO);
  // A cópia guardada também é conferida: mexer nela e no resto junto não passa
  const copiaIntegra = !!gravado && codigoDoConteudo(gravado) === codigo;
  const finalizada = os.status === 'FINALIZADA';
  const confere = finalizada && copiaIntegra && codigoDoConteudo(atual) === codigo;
  const diferencas = confere
    ? []
    : [
        ...(finalizada ? [] : ['a OS não está mais finalizada']),
        ...(copiaIntegra ? [] : ['a cópia guardada na finalização']),
        ...(gravado ? diferencasDoConteudo(gravado, atual) : []),
      ];

  return {
    os_id: os.id.trim(),
    numero_os: os.numero_os,
    finalizada_em: os.finalizada_em?.toISOString() ?? null,
    finalizado_por: os.finalizado_por,
    confere,
    diferencas,
    anexos: gravado && !confere ? anexosQueMudaram(gravado.anexos, atual.anexos) : [],
    conferido_em: new Date().toISOString(),
  };
}

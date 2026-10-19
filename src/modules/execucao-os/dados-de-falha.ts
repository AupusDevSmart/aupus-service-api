import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Os dados de falha da OS (SN-60): se o equipamento parou, quando parou e
 * voltou a funcionar, o sintoma, a causa e a ação. A base do MTTR (tempo
 * parado por falha), do MTBF (tempo entre falhas) e da disponibilidade (Fase 6).
 *
 * Na corretiva, sintoma, causa e ação são obrigatórios, e é preciso dizer se o
 * equipamento parou: só quem parou tem parada. Exigir a parada de toda
 * corretiva obrigava a inventar uma — a anomalia nasce "funcionando", a tela
 * puxava a data dela, e o técnico gravava dias de parada que não houve. A
 * falha sem parada conta no MTBF e não entra na disponibilidade.
 *
 * Quando parou e quando voltou são **opcionais** mesmo para quem parou
 * (decisão do usuário, 19/out/2026: o técnico nem sempre sabe a hora). Por
 * isso a resposta "parou?" é gravada (`equipamento_parou`): deduzida das
 * datas, um "sim" sem horário ficaria igual a um "não". A corretiva que parou
 * sem horário conta como parada, mas sem duração para o MTTR.
 *
 * Nos outros tipos tudo é opcional (a preventiva pode ter parado o
 * equipamento). Em qualquer tipo a parada vai inteira — início sem retorno não
 * tem duração — e parada informada é "parou".
 */
export interface DadosDeFalhaDoPedido {
  equipamento_parou?: boolean;
  parada_inicio?: string;
  parada_fim?: string;
  falha_sintoma?: string;
  falha_causa?: string;
  falha_acao?: string;
}

export interface DadosDeFalha {
  /** Null = não respondido (fora da corretiva, sem parada) */
  equipamento_parou: boolean | null;
  parada_inicio: Date | null;
  parada_fim: Date | null;
  falha_sintoma: string | null;
  falha_causa: string | null;
  falha_acao: string | null;
}

/** O relógio do celular adiantado uns minutos não pode travar a execução. */
const FOLGA_DO_RELOGIO_MS = 5 * 60_000;

/**
 * Parada de mais de um ano é quase sempre o ano digitado errado (2025 no lugar
 * de 2026), e um ano de parada sozinho estragava o MTTR e a disponibilidade.
 */
const PARADA_MAXIMA_MS = 365 * 24 * 3_600_000;

const texto = (v?: string) => v?.trim() || null;

/**
 * No segundo, para baixo: a coluna é TIMESTAMP(0), que ARREDONDA os
 * milissegundos. Início em :00.700 e retorno em :00.300 viravam :01 e :00 — o
 * retorno antes da parada, e o CHECK do banco dava 500.
 */
function noSegundo(iso?: string): Date | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) throw new BadRequestException(`Data inválida: ${iso}.`);
  return new Date(Math.floor(ms / 1000) * 1000);
}

const emLista = (itens: string[]) =>
  itens.length === 1 ? itens[0] : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;

/**
 * O que gravar ao executar a OS. Grava os cinco campos sempre (o painel do
 * Executar vem preenchido com o que já está na OS): reexecutar depois de
 * reabrir mostra e regrava o que havia, em vez de manter calado o antigo.
 */
export function dadosDeFalha(tipo: string, pedido: DadosDeFalhaDoPedido, agora = new Date()): DadosDeFalha {
  const dados: DadosDeFalha = {
    equipamento_parou: pedido.equipamento_parou ?? null,
    parada_inicio: noSegundo(pedido.parada_inicio),
    parada_fim: noSegundo(pedido.parada_fim),
    falha_sintoma: texto(pedido.falha_sintoma),
    falha_causa: texto(pedido.falha_causa),
    falha_acao: texto(pedido.falha_acao),
  };
  const temParada = !!dados.parada_inicio || !!dados.parada_fim;

  if (tipo === 'CORRETIVA') {
    if (pedido.equipamento_parou === undefined) {
      throw new BadRequestException('Na corretiva, diga se o equipamento parou (equipamento_parou).');
    }
    const faltam = [
      !dados.falha_sintoma && 'o sintoma',
      !dados.falha_causa && 'a causa',
      !dados.falha_acao && 'a ação tomada',
    ].filter((f): f is string => !!f);
    if (faltam.length > 0) throw new BadRequestException(`Na corretiva, informe ${emLista(faltam)}.`);
  }
  if (pedido.equipamento_parou === false && temParada) {
    throw new BadRequestException('O equipamento não parou: tire as datas da parada (ou marque que parou).');
  }

  const { parada_inicio: inicio, parada_fim: fim } = dados;
  if (!!inicio !== !!fim) {
    throw new BadRequestException('Informe quando o equipamento parou e quando voltou a funcionar, os dois.');
  }
  if (inicio && fim) {
    // Parada informada é parou, também na preventiva que não pergunta
    dados.equipamento_parou = true;
    if (fim < inicio) throw new BadRequestException('O equipamento voltou a funcionar antes de parar: confira as duas datas.');
    if (fim.getTime() > agora.getTime() + FOLGA_DO_RELOGIO_MS) {
      throw new BadRequestException('O retorno ao funcionamento está no futuro: informe quando o equipamento voltou de fato.');
    }
    if (fim.getTime() - inicio.getTime() > PARADA_MAXIMA_MS) {
      throw new BadRequestException('Parada de mais de um ano: confira o ano das duas datas.');
    }
  }
  return dados;
}

/** Minutos parados, para a tela e os indicadores; sem parada, null. */
export const minutosParado = (d: Pick<DadosDeFalha, 'parada_inicio' | 'parada_fim'>) =>
  d.parada_inicio && d.parada_fim ? Math.round((d.parada_fim.getTime() - d.parada_inicio.getTime()) / 60_000) : null;

/** Os dados de falha que já estão na OS (a resposta de buscarPorId). */
export const dadosDaOS = (os: {
  equipamento_parou?: boolean | null;
  parada_inicio?: Date | string | null;
  parada_fim?: Date | string | null;
  falha_sintoma?: string | null;
  falha_causa?: string | null;
  falha_acao?: string | null;
}): DadosDeFalha => ({
  equipamento_parou: os.equipamento_parou ?? null,
  parada_inicio: os.parada_inicio ? new Date(os.parada_inicio) : null,
  parada_fim: os.parada_fim ? new Date(os.parada_fim) : null,
  falha_sintoma: os.falha_sintoma ?? null,
  falha_causa: os.falha_causa ?? null,
  falha_acao: os.falha_acao ?? null,
});

/**
 * O equipamento da corretiva, quando a OS não o tem: o da anomalia que a
 * originou; senão, o das tarefas, se for um só. Com vários, nenhum — escolher
 * um contaria a parada no equipamento errado. Os ids são Char(26): aparados.
 */
export async function equipamentoDaCorretiva(
  prisma: Pick<PrismaClient, 'anomalias' | 'tarefas_os'>,
  osId: string,
  anomaliaId?: string | null,
): Promise<string | null> {
  if (anomaliaId?.trim()) {
    const anomalia = await prisma.anomalias.findUnique({ where: { id: anomaliaId }, select: { equipamento_id: true } });
    if (anomalia?.equipamento_id?.trim()) return anomalia.equipamento_id.trim();
  }
  const vinculos = await prisma.tarefas_os.findMany({ where: { os_id: osId, equipamento_id: { not: null } }, select: { equipamento_id: true } });
  const equipamentos = new Set(vinculos.map((v) => v.equipamento_id!.trim()));
  return equipamentos.size === 1 ? [...equipamentos][0] : null;
}

/** O que mudou nos dados de falha ao reexecutar, para o histórico (o auditor vê o antes e o depois). */
export function mudancasNaFalha(antes: DadosDeFalha, depois: DadosDeFalha): string | null {
  const rotulos: Record<keyof DadosDeFalha, string> = {
    equipamento_parou: 'parou',
    parada_inicio: 'parou em',
    parada_fim: 'voltou em',
    falha_sintoma: 'sintoma',
    falha_causa: 'causa',
    falha_acao: 'ação',
  };
  const valor = (v: DadosDeFalha[keyof DadosDeFalha]) =>
    v instanceof Date ? v.toISOString() : typeof v === 'boolean' ? (v ? 'sim' : 'não') : (v ?? '—');
  const mudou = (Object.keys(rotulos) as Array<keyof DadosDeFalha>).filter((k) => valor(antes[k]) !== valor(depois[k]));
  if (mudou.length === 0) return null;
  return `Dados de falha alterados: ${mudou.map((k) => `${rotulos[k]}: ${valor(antes[k])} -> ${valor(depois[k])}`).join('; ')}`;
}

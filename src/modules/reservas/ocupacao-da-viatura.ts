// src/modules/reservas/ocupacao-da-viatura.ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { variantesDeId, variantesDeIds } from '../tarefas/ids';

/**
 * Quando uma viatura está ocupada — regra única para reserva manual,
 * programação, aprovação e a tela (docs/SPEC-RESERVAS-DE-VIATURA.md).
 *
 * Antes cada caminho fazia o seu: a programação não checava nada, a reserva
 * manual comparava só os dias (08–12h e 13–18h "conflitavam") e a tela
 * concatenava um ISO com a hora, o que dava data inválida e deixava toda
 * viatura livre.
 *
 * A reserva guarda o DIA (`data_inicio`/`data_fim`, timestamp de meia-noite UTC)
 * e a HORA em texto ("HH:mm", hora de Brasília). O intervalo real junta os dois
 * no fuso de Brasília — o Brasil não tem horário de verão desde 2019 e o
 * servidor não tem TZ configurado, então o deslocamento é fixo.
 */

export const FUSO_DE_BRASILIA = '-03:00';
const DESLOCAMENTO_MS = 3 * 60 * 60 * 1000;
/** Sem hora informada, a reserva ocupa o dia inteiro (D2) */
export const HORA_INICIO_DO_DIA = '00:00';
export const HORA_FIM_DO_DIA = '23:59';

type Cliente = Prisma.TransactionClient;

export interface JanelaDaReserva {
  data_inicio: Date | string;
  data_fim: Date | string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
}

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

/**
 * Dia (YYYY-MM-DD) que a data representa. Meia-noite UTC é um dia gravado como
 * data pura; qualquer outro instante é lido no fuso de Brasília (algumas
 * reservas antigas herdaram a previsão da programação, com hora).
 */
export function diaDe(data: Date | string): string {
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const d = new Date(data);
  const meiaNoiteUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return meiaNoiteUtc ? d.toISOString().slice(0, 10) : diaEmBrasilia(d);
}

/** Dia (YYYY-MM-DD) de um instante, em Brasília */
export const diaEmBrasilia = (instante: Date): string =>
  new Date(instante.getTime() - DESLOCAMENTO_MS).toISOString().slice(0, 10);

/** O dia gravado como data pura (meia-noite UTC), como as reservas já estão no banco */
export const dataPura = (dia: string): Date => new Date(`${dia}T00:00:00.000Z`);

/** Hora (HH:mm) de Brasília de um instante */
export const horaDe = (instante: Date): string =>
  new Date(instante.getTime() - DESLOCAMENTO_MS).toISOString().slice(11, 16);

export function intervaloDaReserva(janela: JanelaDaReserva): Intervalo {
  const horaInicio = janela.hora_inicio || HORA_INICIO_DO_DIA;
  const horaFim = janela.hora_fim || HORA_FIM_DO_DIA;
  const inicio = new Date(`${diaDe(janela.data_inicio)}T${horaInicio}:00${FUSO_DE_BRASILIA}`);
  let fim = new Date(`${diaDe(janela.data_fim)}T${horaFim}:00${FUSO_DE_BRASILIA}`);
  // "Até 23:59" é até o fim do dia: quem reserva o dia seguinte desde 00:00 não conflita
  if (horaFim === HORA_FIM_DO_DIA) fim = new Date(fim.getTime() + 60_000);
  return { inicio, fim };
}

/** O caminho de volta: intervalo real em dia e hora de Brasília (fim à meia-noite = "até 23:59") */
export function janelaDoIntervalo({ inicio, fim }: Intervalo): Required<JanelaDaReserva> {
  const fimNaMeiaNoite = horaDe(fim) === '00:00' && fim > inicio;
  const ultimoInstante = fimNaMeiaNoite ? new Date(fim.getTime() - 60_000) : fim;
  return {
    data_inicio: diaEmBrasilia(inicio),
    hora_inicio: horaDe(inicio),
    data_fim: diaEmBrasilia(ultimoInstante),
    hora_fim: horaDe(ultimoInstante),
  };
}

/**
 * Leva a janela para começar em `novoInicio`, com a mesma duração. É o que a
 * aprovação faz quando sugere outro dia: antes a OS mudava de data e a reserva
 * ficava no dia antigo — viatura presa no dia errado e livre no certo.
 */
export function moverJanela(janela: JanelaDaReserva, novoInicio: Date): Required<JanelaDaReserva> {
  const { inicio, fim } = intervaloDaReserva(janela);
  return janelaDoIntervalo({ inicio: novoInicio, fim: new Date(novoInicio.getTime() + (fim.getTime() - inicio.getTime())) });
}

/** Instante de um dia + hora de Brasília */
export const instanteEmBrasilia = (dia: string, hora: string): Date => new Date(`${dia}T${hora}:00${FUSO_DE_BRASILIA}`);

/** Limites abertos: quem devolve às 12h libera para quem sai às 12h */
export const sobrepoe = (a: Intervalo, b: Intervalo): boolean => a.inicio < b.fim && b.inicio < a.fim;

/** "10/03 08:00", em Brasília */
export function formatarMomento(instante: Date): string {
  const local = new Date(instante.getTime() - DESLOCAMENTO_MS).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`;
}

export function validarJanela(janela: JanelaDaReserva): Intervalo {
  for (const hora of [janela.hora_inicio, janela.hora_fim]) {
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      throw new BadRequestException(`Hora inválida: "${hora}" (use HH:mm)`);
    }
  }
  const intervalo = intervaloDaReserva(janela);
  if (Number.isNaN(intervalo.inicio.getTime()) || Number.isNaN(intervalo.fim.getTime())) {
    throw new BadRequestException('Data da reserva inválida');
  }
  if (intervalo.fim <= intervalo.inicio) {
    throw new BadRequestException('O fim da reserva precisa ser depois do início');
  }
  return intervalo;
}

/** Campos de dia e hora prontos para gravar, sempre preenchidos (dia inteiro sem hora) */
export function camposDaJanela(janela: JanelaDaReserva) {
  return {
    data_inicio: dataPura(diaDe(janela.data_inicio)),
    data_fim: dataPura(diaDe(janela.data_fim)),
    hora_inicio: janela.hora_inicio || HORA_INICIO_DO_DIA,
    hora_fim: janela.hora_fim || HORA_FIM_DO_DIA,
  };
}

type ReservaAtiva = {
  id: string;
  veiculo_id: string;
  data_inicio: Date;
  data_fim: Date;
  hora_inicio: string;
  hora_fim: string;
  finalidade: string;
};

/**
 * Ocupação efetiva de cada reserva ativa. A de uma OS já em execução vai até
 * AGORA se o horário dela passou: a viatura só volta quando a OS é executada
 * (D3). OS que nem começou não estende — a viatura está no pátio.
 */
async function ocupacoes(prisma: Cliente, reservasAtivas: ReservaAtiva[], agora: Date) {
  const ids = reservasAtivas.map((r) => r.id.trim());
  const emCampo = ids.length
    ? await prisma.ordens_servico.findMany({
        where: { reserva_id: { in: variantesDeIds(ids) }, status: { in: ['EM_EXECUCAO', 'PAUSADA'] } },
        select: { reserva_id: true },
      })
    : [];
  const idsEmCampo = new Set(emCampo.map((o) => o.reserva_id?.trim()));

  return reservasAtivas.map((reserva) => {
    const intervalo = intervaloDaReserva(reserva);
    if (idsEmCampo.has(reserva.id.trim()) && intervalo.fim < agora) intervalo.fim = agora;
    return { reserva, intervalo };
  });
}

const descreverConflito = (reserva: ReservaAtiva, intervalo: Intervalo) =>
  `reservada de ${formatarMomento(intervalo.inicio)} a ${formatarMomento(intervalo.fim)} (${reserva.finalidade})`;

const STATUS_QUE_NAO_RESERVA = ['inativo', 'manutencao'];

/**
 * Garante que a viatura pode ser reservada na janela — senão, 409 com quem
 * ocupa e quando (D1: conflito bloqueia). Roda dentro da transação de quem
 * grava, com trava por viatura: duas gravações simultâneas não passam juntas.
 */
export async function garantirViaturaLivre(
  prisma: Cliente,
  { veiculoId, janela, excluirReservaId, agora = new Date() }: {
    veiculoId: string;
    janela: JanelaDaReserva;
    excluirReservaId?: string | null;
    agora?: Date;
  },
) {
  const id = veiculoId.trim();
  const intervalo = validarJanela(janela);

  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reserva-viatura:${id}`}))`;

  const veiculo = await prisma.veiculo.findFirst({ where: { id: { in: variantesDeId(id) }, ativo: true } });
  if (!veiculo) throw new NotFoundException('Viatura não encontrada');
  if (STATUS_QUE_NAO_RESERVA.includes(veiculo.status)) {
    throw new ConflictException(`A viatura ${veiculo.placa} está ${veiculo.status === 'manutencao' ? 'em manutenção' : 'inativa'}`);
  }

  const excluir = excluirReservaId?.trim();
  const ativas = await prisma.reserva_veiculo.findMany({
    where: {
      veiculo_id: { in: variantesDeId(id) },
      status: 'ativa',
      ...(excluir ? { id: { notIn: variantesDeId(excluir) } } : {}),
    },
  });

  for (const { reserva, intervalo: ocupado } of await ocupacoes(prisma, ativas, agora)) {
    if (sobrepoe(intervalo, ocupado)) {
      throw new ConflictException(`A viatura ${veiculo.placa} já está ${descreverConflito(reserva, ocupado)}`);
    }
  }

  return veiculo;
}

export interface DisponibilidadeDaViatura {
  id: string;
  nome: string;
  placa: string;
  marca: string;
  modelo: string;
  tipo: string;
  tipo_combustivel: string;
  status: string;
  capacidade_passageiros: number;
  capacidade_carga: number;
  quilometragem: number;
  disponivel: boolean;
  motivo: string | null;
}

/**
 * Cada viatura ativa com livre/ocupada na janela, pela mesma regra de
 * `garantirViaturaLivre`. É o que o seletor da programação mostra — antes ele
 * baixava 10 reservas e comparava datas inválidas no navegador.
 */
export async function disponibilidadeDasViaturas(
  prisma: Cliente,
  janela: JanelaDaReserva,
  excluirReservaId?: string | null,
  { agora = new Date(), filtro = {} }: { agora?: Date; filtro?: Prisma.veiculoWhereInput } = {},
): Promise<DisponibilidadeDaViatura[]> {
  const intervalo = validarJanela(janela);
  const veiculos = await prisma.veiculo.findMany({
    where: { ...filtro, ativo: true, status: { not: 'inativo' } },
    orderBy: { placa: 'asc' },
  });
  const excluir = excluirReservaId?.trim();
  const ativas = await prisma.reserva_veiculo.findMany({
    where: { status: 'ativa', ...(excluir ? { id: { notIn: variantesDeId(excluir) } } : {}) },
  });
  const ocupadas = await ocupacoes(prisma, ativas, agora);

  return veiculos.map((v) => {
    const conflito = ocupadas.find(
      (o) => o.reserva.veiculo_id.trim() === v.id.trim() && sobrepoe(intervalo, o.intervalo),
    );
    const motivo =
      v.status === 'manutencao'
        ? 'Em manutenção'
        : conflito
          ? descreverConflito(conflito.reserva, conflito.intervalo).replace(/^r/, 'R')
          : null;
    return {
      id: v.id.trim(),
      nome: v.nome,
      placa: v.placa,
      marca: v.marca,
      modelo: v.modelo,
      tipo: v.tipo,
      tipo_combustivel: v.tipo_combustivel,
      status: v.status,
      capacidade_passageiros: v.capacidade_passageiros,
      capacidade_carga: Number(v.capacidade_carga),
      quilometragem: v.quilometragem,
      disponivel: motivo === null,
      motivo,
    };
  });
}

/** Viatura volta para "disponível" se estava "em uso" (executar, cancelar) */
export async function devolverViatura(prisma: Cliente, veiculoId: string, kmFinal?: number | null) {
  const id = veiculoId.trim();
  const veiculo = await prisma.veiculo.findFirst({ where: { id: { in: variantesDeId(id) } } });
  if (!veiculo) return;
  await prisma.veiculo.update({
    where: { id: veiculo.id },
    data: {
      ...(veiculo.status === 'em_uso' ? { status: 'disponivel' as const } : {}),
      ...(kmFinal != null && kmFinal > veiculo.quilometragem ? { quilometragem: kmFinal } : {}),
    },
  });
}

import { Prisma, TipoAnexoOS } from '@prisma/client';
import { AprovarProgramacaoDto, CancelarProgramacaoDto } from '@/modules/programacao-os/dto/programacao-actions.dto';
import { UpdateProgramacaoDto } from '@/modules/programacao-os/dto/update-programacao.dto';
import {
  AtualizarChecklistDto,
  AuditarOSDto,
  CancelarOSDto,
  ConcluirTarefaDto,
  ExecutarOSDto,
  FinalizarOSDto,
  IniciarExecucaoDto,
  PausarExecucaoDto,
  ReabrirOSDto,
  RetomarExecucaoDto,
} from '@/modules/execucao-os/dto/os-actions.dto';
import { gravarCodigoDeVerificacao } from '@/modules/execucao-os/verificacao-da-os';
import { VeiculosDisponiveisDto } from '@/modules/veiculos/dto/veiculos-disponiveis.dto';
import { validar } from '../ambiente';
import { type Cenario, type Equipamento, type Pessoa, type Planta, pessoa } from '../cenario';
import type { Falha } from '../dados/ocorrencias';
import { INSTRUCOES, type PassoDoSeed } from '../dados/instrucoes';
import { arquivoDaFoto, fotoDeExemplo, type AssuntoDaFoto } from '../foto';
import { type LinhaDoTempo, proximoDiaUtil } from '../linha-do-tempo';
import { as, diaDe, horaDe, instante, somarDias, somarHoras } from '../tempo';
import { planejar, type Planejado } from './recursos-sugeridos';

/**
 * Como a história de uma programação termina (a de agora para frente não
 * acontece): executada e auditada param antes da auditoria e da finalização,
 * para essas telas terem o que mostrar seja qual for o dia em que o seed roda.
 */
export type Destino = 'normal' | 'pendente' | 'em_execucao' | 'pausada' | 'executada' | 'auditada';

export interface Historia {
  programacaoId: string;
  planta: Planta;
  tipo: 'preventiva' | 'corretiva' | 'servico';
  destino: Destino;
  /** O dia em que a equipe deve ir (a corretiva urgente vai na hora) */
  dia: Date;
  /** Corretiva: quando a falha começou, por quanto tempo parou e o que se achou */
  falha?: { inicio: Date; horas?: number; dados?: Falha; resultado?: string; equipamento: Equipamento; troca?: boolean; urgente: boolean };
  /** Serviço: o que entregar */
  resultado?: string;
  /** Instante desejado do início (a corretiva urgente começa fora do horário) */
  inicioDesejado?: Date;
}

interface Ordem {
  h: Historia;
  osId: string;
  plano: Planejado;
  planejador: Pessoa;
  responsavel: Pessoa;
  veiculo: { chave: string; id: string; km: number } | null;
  kmInicial?: number;
  inicio?: Date;
  naoFeitas: Map<string, string>;
  foraDaFaixa: string[];
  /** O que a corretiva disse da falha no executar: o refazer depois da auditoria repete */
  falhaInformada?: Record<string, unknown>;
  /** As horas de cada técnico no executar: o refazer manda de novo (o service pede as de todos) */
  horasInformadas?: Array<{ id: string; horas: number }>;
}

const MOTIVOS_DE_NAO_FEITA = [
  'O cliente não liberou o desligamento: equipamento em operação crítica no dia',
  'Acesso ao equipamento bloqueado pela obra do cliente',
  'Instrumento indisponível: o megôhmetro estava na calibração',
  'Chuva forte: o trabalho em altura foi suspenso por segurança',
];

const OBSERVACOES_DE_CAMPO = [
  'Equipe no local às {hora}; área liberada pelo operador do cliente.',
  'Chegamos às {hora}. Precisamos aguardar a liberação da área pela segurança do trabalho.',
  'Atividade em andamento; até agora sem anormalidade.',
  'Foi preciso isolar a área com cones: havia circulação de empilhadeiras.',
];

const NOTAS_INTERNAS = [
  'Separar o kit de aterramento temporário: o da viatura 02 está com a garra quebrada.',
  'Confirmar com o cliente o desligamento programado na véspera.',
  'Levar o instrumento calibrado: o certificado do outro vence este mês.',
  'Conferir o estoque do almoxarifado antes de sair.',
];

/** Os passos do seed pelo texto do item (o item é "tarefa: passo") */
const PASSOS = new Map<string, PassoDoSeed>(INSTRUCOES.flatMap((i) => i.passos.map((p) => [p.descricao, p] as const)));

const casasDaLeitura = (min: number, max: number) => (max - min >= 1000 ? 0 : max - min >= 20 ? 1 : 2);

function leitura(c: Cenario, passo: PassoDoSeed | undefined, min: number | null, max: number | null): { valor: number; fora: boolean } {
  const faixa = passo?.leitura;
  const lo = Number(min ?? faixa?.min ?? 0);
  const hi = Number(max ?? faixa?.max ?? lo + 10);
  const [a, b] = faixa?.tipico ?? [lo + (hi - lo) * 0.3, lo + (hi - lo) * 0.7];
  const sorte = c.sorteio.proximo();
  // Quase sempre no típico; às vezes no limite; raramente fora da faixa (a tela marca)
  let valor = sorte < 0.94 ? c.sorteio.decimal(a, b, 4) : sorte < 0.99 ? c.sorteio.decimal(lo, hi, 4) : hi + (hi - lo) * c.sorteio.decimal(0.03, 0.12, 4);
  valor = Number(valor.toFixed(casasDaLeitura(lo, hi)));
  return { valor, fora: valor < lo || valor > hi };
}

interface JanelaDaViatura {
  reserva_data_inicio: string;
  reserva_data_fim: string;
  reserva_hora_inicio: string;
  reserva_hora_fim: string;
}

/**
 * Quando a viatura sai e volta. A equipe sai antes do início (de madrugada
 * para as plantas longe) e volta no fim do último dia; a corretiva urgente
 * sai na hora, já que ninguém espera o dia seguinte, e volta quando acaba.
 */
function janelaDaViatura(h: Historia, planta: Planta, dia: Date, plano: Planejado, agora: Date): JanelaDaViatura {
  if (h.inicioDesejado) {
    const viagem = planta.dados.distanciaKm / 70;
    const saida = new Date(Math.max(agora.getTime(), somarHoras(h.inicioDesejado, -viagem).getTime()));
    const volta = somarHoras(h.inicioDesejado, plano.duracaoHoras + viagem + 0.5);
    return { reserva_data_inicio: diaDe(saida), reserva_hora_inicio: horaDe(saida), reserva_data_fim: diaDe(volta), reserva_hora_fim: horaDe(volta) };
  }
  return {
    reserva_data_inicio: diaDe(dia),
    reserva_hora_inicio: planta.dados.distanciaKm > 300 ? '05:30' : '07:00',
    reserva_data_fim: diaDe(somarDias(dia, plano.dias - 1)),
    reserva_hora_fim: '18:00',
  };
}

/**
 * Uma viatura livre na janela inteira, pela mesma consulta da tela (a regra de
 * ocupação do backend); as longas distâncias vão de caminhonete.
 */
async function viaturaLivre(c: Cenario, planta: Planta, janela: JanelaDaViatura, pessoas: number): Promise<{ chave: string; id: string; km: number } | null> {
  const livres = await c.s.veiculos.disponibilidade(
    await validar(
      VeiculosDisponiveisDto,
      { dataInicio: janela.reserva_data_inicio, dataFim: janela.reserva_data_fim, horaInicio: janela.reserva_hora_inicio, horaFim: janela.reserva_hora_fim },
      'viaturas livres',
    ),
  );
  const disponiveis = new Set(livres.filter((v) => v.disponivel).map((v) => v.id.trim()));
  const ordem = planta.dados.distanciaKm > 150 ? ['hilux1', 'hilux2', 'sprinter', 'strada', 'saveiro'] : ['strada', 'saveiro', 'sprinter', 'hilux2', 'hilux1'];
  const candidatas = pessoas > 4 ? ['sprinter', ...ordem.filter((k) => k !== 'sprinter')] : ordem;
  for (const chave of candidatas) {
    const v = c.veiculos.get(chave);
    if (v && disponiveis.has(v.id)) return { chave, ...v };
  }
  return null;
}

async function osDaProgramacao(c: Cenario, programacaoId: string): Promise<string> {
  const os = await c.prisma.ordens_servico.findFirst({ where: { programacao_id: programacaoId, deletado_em: null }, select: { id: true } });
  if (!os) throw new Error(`A aprovação da programação ${programacaoId} não gerou OS`);
  return os.id.trim();
}

/** O planejador monta a programação (equipe, materiais, viatura) e o aprovador aprova */
export function contarHistoria(c: Cenario, linha: LinhaDoTempo, h: Historia, quandoPlanejar: Date): void {
  linha.marcar(quandoPlanejar, `planejar ${h.programacaoId}`, async () => {
    const planejador = pessoa(c, c.sorteio.chance(0.5) ? 'renata' : 'felipe');
    const programacao = await c.prisma.programacoes_os.findUniqueOrThrow({ where: { id: h.programacaoId }, select: { status: true, descricao: true } });
    if (programacao.status !== 'PENDENTE') return;

    // A preventiva às vezes não acontece: o planejador cancela e o ciclo é pulado
    if (h.tipo === 'preventiva' && h.destino === 'normal' && c.sorteio.chance(0.04)) {
      const motivo = c.sorteio.um([
        'Equipamento desligado pelo cliente para a reforma da subestação: o ciclo foi pulado',
        'Preventiva antecipada junto com a corretiva da semana: não há o que fazer neste ciclo',
      ]);
      await c.s.programacoes.cancelar(h.programacaoId, await validar(CancelarProgramacaoDto, { motivo_cancelamento: motivo }, 'cancelar programação'), planejador.id, planejador.usuario);
      return;
    }

    const plano = await planejar(c, h.programacaoId, h.planta);
    const agora = c.relogio.passoEmCurso()!;
    // O dia: o desejado, nunca antes de amanhã (a urgente vai hoje), num dia útil da planta e com viatura
    let dia = h.falha?.urgente ? h.dia : proximoDiaUtil(h.planta.chave, h.dia.getTime() < somarDias(agora, 1).getTime() ? somarDias(agora, 1) : h.dia);
    let janela = janelaDaViatura(h, h.planta, dia, plano, agora);
    let veiculo = await viaturaLivre(c, h.planta, janela, plano.tecnicos.length);
    for (let i = 0; i < 4 && !veiculo && !h.falha?.urgente; i++) {
      dia = proximoDiaUtil(h.planta.chave, somarDias(dia, 1));
      janela = janelaDaViatura(h, h.planta, dia, plano, agora);
      veiculo = await viaturaLivre(c, h.planta, janela, plano.tecnicos.length);
    }
    const responsavel = plano.equipe[0] ?? pessoa(c, h.planta.dados.tecnicos[0]);
    const horaDoInicio = h.inicioDesejado ? horaDe(h.inicioDesejado) : h.planta.dados.distanciaKm > 300 ? '07:30' : '08:00';

    const corpoDoPlanejamento = await validar(
        UpdateProgramacaoDto,
        {
          tecnicos: plano.tecnicos,
          materiais: plano.materiais,
          ferramentas: plano.ferramentas,
          itens_orcamento: plano.itens_orcamento,
          responsavel_id: responsavel.id,
          data_hora_programada: instante(as(dia, horaDoInicio)),
          tempo_estimado: Math.max(0.25, plano.horasDeEquipe),
          duracao_estimada: Math.max(0.25, plano.duracaoHoras),
          ...(veiculo && {
            necessita_veiculo: true,
            veiculo_id: veiculo.id,
            ...janela,
            reserva_finalidade: `${programacao.descricao.slice(0, 120)}`,
            assentos_necessarios: Math.min(10, Math.max(1, plano.tecnicos.length)),
          }),
          observacoes_programacao: c.sorteio.chance(0.35) ? c.sorteio.um(NOTAS_INTERNAS) : undefined,
        },
        'planejar programação',
      );
    await c.s.programacoes.atualizar(h.programacaoId, corpoDoPlanejamento, planejador.id, planejador.usuario);

    if (h.destino === 'pendente') return;

    const aprovador = h.tipo === 'preventiva' && c.sorteio.chance(0.6) ? planejador : pessoa(c, 'marcos');
    await c.s.programacoes.aprovar(
      h.programacaoId,
      await validar(
        AprovarProgramacaoDto,
        {
          observacoes: h.falha?.urgente ? 'Aprovada em caráter de urgência' : 'Equipe, materiais e viatura conferidos',
          data_programada_sugerida: diaDe(dia),
          hora_programada_sugerida: horaDoInicio,
        },
        'aprovar programação',
      ),
      aprovador.id,
      aprovador.usuario,
    );
    const ordem: Ordem = { h, osId: await osDaProgramacao(c, h.programacaoId), plano, planejador, responsavel, veiculo, naoFeitas: new Map(), foraDaFaixa: [] };

    if (c.sorteio.chance(0.2)) {
      await c.s.comentarios.comentar('ordem_servico', ordem.osId, { comentario: c.sorteio.um(NOTAS_INTERNAS), interno: true }, planejador.usuario);
    }

    // Às vezes o cliente pede para remarcar e a OS é cancelada antes de começar
    if (h.tipo === 'preventiva' && h.destino === 'normal' && c.sorteio.chance(0.025)) {
      linha.marcar(as(somarDias(dia, -1), '16:00'), `cancelar OS ${ordem.osId}`, async () => {
        await c.s.execucoes.cancelar(
          ordem.osId,
          await validar(CancelarOSDto, { motivo_cancelamento: 'O cliente pediu para remarcar: a parada da linha foi adiada', observacoes: 'Ciclo pulado; o próximo segue o plano' }, 'cancelar OS'),
          planejador.id,
          planejador.usuario,
        );
      });
      return;
    }

    const inicio = h.inicioDesejado ?? somarHoras(as(dia, horaDoInicio), c.sorteio.decimal(0, 0.6, 2));
    linha.marcar(inicio, `iniciar OS ${ordem.osId}`, () => iniciar(c, linha, ordem));
  });
}

async function foto(c: Cenario, ordem: Ordem, tipo: TipoAnexoOS, assunto: AssuntoDaFoto, rotulo: string, destino: { checklist_item_id?: string } = {}) {
  const conteudo = fotoDeExemplo(assunto, rotulo);
  const nome = `${assunto}-${diaDe(c.relogio.passoEmCurso()!)}-${Math.floor(c.sorteio.proximo() * 1e6)}.png`;
  await c.s.anexosDaOS.uploadAnexo(ordem.osId, arquivoDaFoto(nome, conteudo), tipo, rotulo.slice(0, 200), undefined, ordem.responsavel.usuario, destino);
}

async function iniciar(c: Cenario, linha: LinhaDoTempo, ordem: Ordem): Promise<void> {
  const { h, plano } = ordem;
  ordem.inicio = c.relogio.passoEmCurso()!;
  ordem.kmInicial = ordem.veiculo ? c.veiculos.get(ordem.veiculo.chave)!.km : undefined;
  await c.s.execucoes.iniciar(
    ordem.osId,
    await validar(
      IniciarExecucaoDto,
      {
        equipe_presente: plano.equipe.map((p) => p.nome),
        responsavel_execucao: ordem.responsavel.nome,
        observacoes: h.falha ? 'Atendimento da corretiva iniciado' : 'Início conforme a programação',
        ...(ordem.kmInicial !== undefined && { km_inicial: ordem.kmInicial }),
      },
      'iniciar OS',
    ),
    ordem.responsavel.id,
    ordem.responsavel.usuario,
  );
  if (h.falha) await foto(c, ordem, TipoAnexoOS.FOTO_ANTES, 'defeito', `${h.falha.equipamento.nome}: estado encontrado`);
  if (c.sorteio.chance(0.3)) {
    await c.s.comentarios.comentar(
      'ordem_servico',
      ordem.osId,
      { comentario: c.sorteio.um(OBSERVACOES_DE_CAMPO).replace('{hora}', horaDe(ordem.inicio)) },
      ordem.responsavel.usuario,
    );
  }

  if (h.destino === 'em_execucao') {
    linha.marcar(somarHoras(ordem.inicio, 0.5), `trabalho parcial ${ordem.osId}`, () => trabalhar(c, ordem, 0.4));
    return;
  }
  if (h.destino === 'pausada') {
    linha.marcar(somarHoras(ordem.inicio, 1), `trabalho parcial ${ordem.osId}`, () => trabalhar(c, ordem, 0.3));
    linha.marcar(somarHoras(ordem.inicio, 2.5), `pausar OS ${ordem.osId}`, async () => {
      await c.s.execucoes.pausar(
        ordem.osId,
        await validar(PausarExecucaoDto, { motivo_pausa: 'Chuva forte: aguardando para abrir a string box com segurança', observacoes: 'Equipe abrigada no eletrocentro' }, 'pausar OS'),
        ordem.responsavel.id,
        ordem.responsavel.usuario,
      );
    });
    return;
  }

  const fim = h.falha?.horas ? somarHoras(h.falha.inicio, h.falha.horas) : somarHoras(ordem.inicio, plano.dias > 1 ? (plano.dias - 1) * 24 + 4 : plano.duracaoHoras);
  const duracao = Math.max(0.5, (fim.getTime() - ordem.inicio.getTime()) / 3_600_000);
  // Metade no meio (a tela mostra o progresso); o resto antes do executar
  linha.marcar(somarHoras(ordem.inicio, duracao * 0.5), `trabalho ${ordem.osId}`, () => trabalhar(c, ordem, 0.5));

  // Uma parada no meio: liberação do cliente, ou o fim do dia na de vários dias
  if (plano.dias > 1 || (duracao >= 1.5 && c.sorteio.chance(0.1))) {
    const pausa = plano.dias > 1 ? somarHoras(ordem.inicio, 3) : somarHoras(ordem.inicio, duracao * 0.3);
    // A volta é sempre antes do fim: executar com a OS pausada não é o que acontece em campo
    const volta = plano.dias > 1 ? somarHoras(fim, -2) : new Date(Math.min(somarHoras(pausa, c.sorteio.decimal(0.4, 1.2, 2)).getTime(), somarHoras(fim, -0.25).getTime()));
    linha.marcar(pausa, `pausar OS ${ordem.osId}`, async () => {
      const motivo = plano.dias > 1 ? 'Instrumento instalado: a medição corre sozinha até a retirada' : 'Aguardando a liberação da área pelo cliente';
      await c.s.execucoes.pausar(ordem.osId, await validar(PausarExecucaoDto, { motivo_pausa: motivo }, 'pausar OS'), ordem.responsavel.id, ordem.responsavel.usuario);
    });
    linha.marcar(volta, `retomar OS ${ordem.osId}`, async () => {
      await c.s.execucoes.retomar(ordem.osId, await validar(RetomarExecucaoDto, { observacoes_retomada: 'Área liberada; atividade retomada' }, 'retomar OS'), ordem.responsavel.id, ordem.responsavel.usuario);
    });
  }
  linha.marcar(fim, `executar OS ${ordem.osId}`, () => executar(c, linha, ordem));
}

/** Marca o checklist (com as fotos e as leituras) e conclui as tarefas; `parte` < 1 deixa o resto para depois */
async function trabalhar(c: Cenario, ordem: Ordem, parte: number): Promise<void> {
  const os = await c.prisma.ordens_servico.findUniqueOrThrow({ where: { id: ordem.osId }, select: { status: true } });
  if (os.status !== 'EM_EXECUCAO') return;
  const tarefas = await c.prisma.tarefas_os.findMany({
    where: { os_id: ordem.osId, status: 'PENDENTE' },
    orderBy: { ordem: 'asc' },
    select: { id: true, nome_snapshot: true, instrucao_nome: true, equipamento_id: true, origem_item: true },
  });
  const itens = await c.prisma.checklist_atividades_os.findMany({ where: { os_id: ordem.osId }, orderBy: { ordem: 'asc' } });
  const nomeDoEquipamento = new Map([...c.equipamentos.values()].map((e) => [e.id, e.nome]));

  const fazer = tarefas.filter((t) => !ordem.naoFeitas.has(t.id.trim())).slice(0, Math.ceil(tarefas.length * parte));
  for (const t of fazer) {
    if (parte >= 1 && ordem.h.tipo === 'preventiva' && t.origem_item === 'TAREFA' && c.sorteio.chance(0.06)) ordem.naoFeitas.set(t.id.trim(), c.sorteio.um(MOTIVOS_DE_NAO_FEITA));
  }

  const atividades: Array<{ id: string; concluida: boolean; valor_lido?: number; observacoes?: string }> = [];
  for (const item of itens) {
    const tarefaId = item.tarefa_os_id?.trim();
    const tarefa = fazer.find((t) => t.id.trim() === tarefaId);
    if (!tarefa || ordem.naoFeitas.has(tarefa.id.trim()) || item.concluida) continue;
    const textoDoPasso = item.atividade.slice(item.atividade.indexOf(': ') + 2);
    const passo = PASSOS.get(textoDoPasso);
    const equipamento = tarefa.equipamento_id ? nomeDoEquipamento.get(tarefa.equipamento_id.trim()) : undefined;
    if (item.exige_foto) {
      const assunto = passo?.foto ?? 'geral';
      const tipo = assunto === 'antes' ? TipoAnexoOS.FOTO_ANTES : assunto === 'depois' ? TipoAnexoOS.FOTO_DEPOIS : TipoAnexoOS.FOTO_DURANTE;
      await foto(c, ordem, tipo, assunto, `${textoDoPasso} - ${equipamento ?? tarefa.instrucao_nome ?? ''}`, { checklist_item_id: item.id.trim() });
    }
    const registro: (typeof atividades)[number] = { id: item.id.trim(), concluida: true };
    if (item.tipo === 'LEITURA') {
      const { valor, fora } = leitura(c, passo, item.valor_minimo == null ? null : Number(item.valor_minimo), item.valor_maximo == null ? null : Number(item.valor_maximo));
      registro.valor_lido = valor;
      if (fora) {
        registro.observacoes = 'Fora da faixa: registrado para acompanhamento';
        ordem.foraDaFaixa.push(`${equipamento ? `${equipamento}: ` : ''}${textoDoPasso.toLowerCase()} = ${valor} ${item.unidade ?? ''}`.trim());
      }
    }
    atividades.push(registro);
  }
  for (let i = 0; i < atividades.length; i += 400) {
    await c.s.execucoes.atualizarChecklist(ordem.osId, await validar(AtualizarChecklistDto, { atividades: atividades.slice(i, i + 400) }, 'checklist'), ordem.responsavel.id, ordem.responsavel.usuario);
  }
  for (const t of fazer) {
    if (ordem.naoFeitas.has(t.id.trim())) continue;
    await c.s.execucoes.concluirTarefa(
      ordem.osId,
      t.id.trim(),
      await validar(ConcluirTarefaDto, { observacoes: 'Executado conforme a instrução', concluida_por: ordem.responsavel.nome }, 'concluir tarefa'),
      ordem.responsavel.id,
      ordem.responsavel.usuario,
    );
  }
}

/** Arredonda para o quarto de hora, como o técnico anota */
const quartoDeHora = (horas: number) => Math.max(0.25, Math.round(horas * 4) / 4);

/** O que o campo gasta além do orçamento (SN-93): vez por outra, um destes entra como não previsto */
const NAO_PREVISTOS = [
  { descricao: 'Pedágio', natureza: 'VEICULO', de: 18, ate: 96 },
  { descricao: 'Estacionamento no centro da cidade', natureza: 'VEICULO', de: 15, ate: 45 },
  { descricao: 'Lanche da equipe na espera da liberação', natureza: 'DESPESA_CAMPO', de: 60, ate: 180 },
  { descricao: 'Conector MC4 comprado na loja da cidade', natureza: 'OUTRO', de: 35, ate: 140 },
] as const;

/**
 * Os outros custos conferidos no Executar (SN-93, D2), como a equipe faria: o
 * instrumento e o maquinário saem pelo previsto (é a hora do cadastro); o
 * veículo e a despesa de campo variam com a viagem; às vezes um não previsto.
 */
function outrosCustosConferidos(c: Cenario, itens: { id: string; valor: Prisma.Decimal; natureza: string }[]) {
  const conferidos = itens.map((i) => {
    const varia = i.natureza === 'VEICULO' || i.natureza === 'DESPESA_CAMPO';
    const valor = varia ? Number(i.valor) * c.sorteio.decimal(0.85, 1.15, 3) : Number(i.valor);
    return { id: i.id.trim(), valor_real: Math.round(valor * 100) / 100 };
  });
  if (!c.sorteio.chance(0.18)) return conferidos;
  const extra = c.sorteio.um([...NAO_PREVISTOS]);
  return [...conferidos, { descricao: extra.descricao, natureza: extra.natureza, valor_real: c.sorteio.inteiro(extra.de, extra.ate) }];
}

async function executar(c: Cenario, linha: LinhaDoTempo, ordem: Ordem): Promise<void> {
  const { h } = ordem;
  const fim = c.relogio.passoEmCurso()!;
  await trabalhar(c, ordem, 1);
  const [tecnicos, materiais, ferramentas, itens] = await Promise.all([
    c.prisma.tecnicos_os.findMany({ where: { os_id: ordem.osId }, select: { id: true, horas_estimadas: true } }),
    c.prisma.materiais_os.findMany({ where: { os_id: ordem.osId }, select: { id: true, quantidade_planejada: true } }),
    c.prisma.ferramentas_os.findMany({ where: { os_id: ordem.osId }, select: { id: true } }),
    c.prisma.itens_orcamento_os.findMany({ where: { os_id: ordem.osId }, select: { id: true, valor: true, natureza: true }, orderBy: { created_at: 'asc' } }),
  ]);
  if (h.falha?.troca) await trocarEquipamento(c, ordem, h.falha.equipamento);
  if (h.falha) await foto(c, ordem, TipoAnexoOS.FOTO_DEPOIS, 'depois', `${h.falha.equipamento.nome}: após o reparo`);

  const problemas = [
    ...ordem.foraDaFaixa.map((f) => `Leitura fora da faixa: ${f}.`),
    ...[...ordem.naoFeitas.values()].map((m) => `Tarefa não feita: ${m}.`),
  ];
  const km = ordem.veiculo ? ordem.h.planta.dados.distanciaKm + c.sorteio.inteiro(0, 25) : undefined;
  if (ordem.veiculo && km !== undefined) c.veiculos.get(ordem.veiculo.chave)!.km += km;

  // A corretiva sempre diz o que falhou; a parada (MTBF, MTTR) só quando o equipamento parou
  const falhaInformada = {
    ...(h.falha?.dados && { falha_sintoma: h.falha.dados.sintoma, falha_causa: h.falha.dados.causa, falha_acao: h.falha.dados.acao }),
    ...(h.falha && (h.falha.horas ? { equipamento_parou: true, parada_inicio: instante(h.falha.inicio), parada_fim: instante(fim) } : { equipamento_parou: false })),
  };
  ordem.falhaInformada = falhaInformada;
  const horasDosTecnicos = tecnicos.map((t) => ({ id: t.id.trim(), horas: quartoDeHora(Number(t.horas_estimadas) * c.sorteio.decimal(0.85, 1.25, 3)) }));
  ordem.horasInformadas = horasDosTecnicos;
  const outrosCustos = outrosCustosConferidos(c, itens);

  await c.s.execucoes.executar(
    ordem.osId,
    await validar(
      ExecutarOSDto,
      {
        resultado_servico:
          h.falha?.resultado ?? h.resultado ?? (problemas.length > 0 ? 'Preventiva executada com pendências registradas.' : 'Preventiva executada conforme as instruções, sem anormalidades.'),
        ...(problemas.length > 0 && { problemas_encontrados: problemas.join(' ') }),
        ...(ordem.foraDaFaixa.length > 0 && { recomendacoes: 'Acompanhar as leituras fora da faixa na próxima inspeção e abrir corretiva se a tendência continuar.' }),
        tarefas_nao_feitas: [...ordem.naoFeitas].map(([id, motivo]) => ({ id, motivo })),
        horas_dos_tecnicos: horasDosTecnicos,
        materiais_consumidos: materiais.map((m) => ({ id: m.id.trim(), quantidade_consumida: Math.max(0.001, Number((Number(m.quantidade_planejada) * c.sorteio.decimal(0.7, 1, 3)).toFixed(3))) })),
        ferramentas_utilizadas: ferramentas.map((f) => ({ id: f.id.trim(), condicao_depois: c.sorteio.chance(0.9) ? 'Em bom estado' : 'Com desgaste: avaliar a substituição' })),
        ...(outrosCustos.length > 0 && { outros_custos: outrosCustos }),
        ...(km !== undefined && ordem.kmInicial !== undefined && { km_final: ordem.kmInicial + km }),
        ...falhaInformada,
      },
      'executar OS',
    ),
    ordem.responsavel.id,
    ordem.responsavel.usuario,
  );

  if (h.destino === 'executada') return;
  const auditoria = proximoDiaUtil(h.planta.chave, somarDias(fim, 1));
  linha.marcar(as(auditoria, `${c.sorteio.inteiro(9, 15)}:${c.sorteio.um(['05', '20', '40'])}`), `auditar OS ${ordem.osId}`, () => auditar(c, linha, ordem, false));
}

async function auditar(c: Cenario, linha: LinhaDoTempo, ordem: Ordem, segunda: boolean): Promise<void> {
  const auditor = pessoa(c, 'marcos');
  const sorte = c.sorteio.proximo();
  const nota = segunda ? 5 : ordem.naoFeitas.size > 0 ? 3 : sorte < 0.55 ? 5 : sorte < 0.9 ? 4 : 3;
  const observacao = {
    5: 'Serviço completo, fotos e leituras conferidas.',
    4: 'Bom serviço; faltou detalhar o resultado de uma das tarefas.',
    3: ordem.naoFeitas.size > 0 ? 'Ficaram tarefas sem fazer: o plano já reprogramou.' : 'A foto de um dos itens está ilegível.',
  }[nota as 3 | 4 | 5];
  await c.s.execucoes.auditar(ordem.osId, await validar(AuditarOSDto, { avaliacao_qualidade: nota, observacoes_qualidade: observacao }, 'auditar OS'), auditor.id, auditor.usuario);

  const agora = c.relogio.passoEmCurso()!;
  // A nota baixa por foto ilegível volta para campo: reaberta, refeita e auditada de novo
  if (nota === 3 && ordem.naoFeitas.size === 0 && !segunda) {
    linha.marcar(somarHoras(agora, 1), `reabrir OS ${ordem.osId}`, async () => {
      await c.s.execucoes.reabrir(ordem.osId, await validar(ReabrirOSDto, { observacoes: 'Refazer a foto do item ilegível' }, 'reabrir OS'), auditor.id, auditor.usuario);
    });
    const volta = as(proximoDiaUtil(ordem.h.planta.chave, somarDias(agora, 1)), '10:00');
    linha.marcar(volta, `refazer OS ${ordem.osId}`, async () => {
      await foto(c, ordem, TipoAnexoOS.FOTO_DURANTE, 'geral', 'Foto refeita a pedido da auditoria');
      await c.s.execucoes.executar(
        ordem.osId,
        await validar(
          ExecutarOSDto,
          {
            resultado_servico: 'Foto refeita e anexada; serviço sem outras pendências.',
            // A volta para refazer a foto: meia hora a mais de quem foi (o primeiro da equipe)
            horas_dos_tecnicos: (ordem.horasInformadas ?? []).map((t, i) => ({ ...t, horas: i === 0 ? t.horas + 0.5 : t.horas })),
            ...ordem.falhaInformada,
          },
          'executar de novo',
        ),
        ordem.responsavel.id,
        ordem.responsavel.usuario,
      );
    });
    linha.marcar(somarHoras(volta, 5), `auditar de novo ${ordem.osId}`, () => auditar(c, linha, ordem, true));
    return;
  }

  if (ordem.h.destino === 'auditada') return;
  const finalizador = pessoa(c, c.sorteio.chance(0.5) ? 'renata' : 'felipe');
  const quando = as(proximoDiaUtil(ordem.h.planta.chave, somarDias(agora, c.sorteio.inteiro(0, 2))), `${c.sorteio.inteiro(14, 17)}:30`);
  linha.marcar(quando, `finalizar OS ${ordem.osId}`, async () => {
    await c.s.execucoes.finalizar(ordem.osId, await validar(FinalizarOSDto, { observacoes: 'Relatório conferido e enviado ao cliente' }, 'finalizar OS'), finalizador.id, finalizador.usuario);
    if (c.sorteio.chance(0.12)) {
      const cliente = pessoa(c, ordem.h.planta.dados.dono);
      await c.s.comentarios.comentar(
        'ordem_servico',
        ordem.osId,
        { comentario: c.sorteio.um(['Recebemos o relatório. Obrigada pelo cuidado com a área.', 'Favor enviar o PDF também para o e-mail da manutenção.', 'Tudo certo por aqui, obrigado.']) },
        cliente.usuario,
      );
    }
  });
}

/**
 * A troca: o equipamento sai da posição (vai ao fabricante), um novo do mesmo
 * modelo entra, e o plano é herdado com as datas do anterior, como a tela
 * oferece (planos-manutencao §4.1).
 */
async function trocarEquipamento(c: Cenario, ordem: Ordem, antigo: Equipamento): Promise<void> {
  const { corpoDoEquipamento } = await import('./equipamentos');
  const tecnico = ordem.responsavel;
  const execucoes = await c.prisma.tarefas_os.groupBy({
    by: ['tarefa_id'],
    where: { equipamento_id: antigo.id, status: 'CONCLUIDA', data_conclusao: { not: null } },
    _max: { data_conclusao: true },
  });
  await c.s.posicoes.remover(antigo.posicaoId, { motivo: ordem.h.falha?.dados?.causa ?? 'Substituído após falha', usuarioId: tecnico.id });
  await c.s.equipamentos.update(antigo.id, { status: 'Inativo', em_operacao: 'nao', observacoes: 'Retirado da posição e enviado ao fabricante (garantia)' });

  const novoCorpo = await corpoDoEquipamento(c, antigo.planta, antigo.unidade, antigo.dados, diaDe(c.relogio.passoEmCurso()!));
  const novo = await c.s.equipamentos.create(novoCorpo);
  await c.s.posicoes.instalar(antigo.posicaoId, novo.id.trim(), { motivo: 'Substituição após falha', usuarioId: tecnico.id });
  const planejadora = pessoa(c, 'renata');
  await c.s.planos.herdarPlano(
    {
      ativo_funcional_id: antigo.posicaoId,
      equipamento_id: novo.id.trim(),
      criado_por: planejadora.id,
      ajustes: execucoes
        .filter((e) => e.tarefa_id && e._max.data_conclusao)
        .map((e) => ({ tarefa_id: e.tarefa_id!.trim(), data_ultima_execucao: e._max.data_conclusao!.toISOString() })),
    },
    planejadora.usuario,
  );
  c.equipamentos.set(`${antigo.planta.chave}|${antigo.unidade.nome}|${antigo.nome}`, { ...antigo, id: novo.id.trim() });
}

/**
 * Depois do relógio mover as datas, o código de verificação da OS finalizada é
 * gravado de novo com as datas certas. Devolve também os anexos sem soma (o
 * código não provaria a foto): a conferência derruba o seed se houver.
 */
export async function regravarCodigos(c: Cenario): Promise<{ regravados: number; anexosSemSoma: string[] }> {
  const finalizadas = await c.prisma.ordens_servico.findMany({ where: { status: 'FINALIZADA', deletado_em: null }, select: { id: true, numero_os: true } });
  const anexosSemSoma: string[] = [];
  for (const os of finalizadas) {
    const semSoma = await gravarCodigoDeVerificacao(c.prisma, os.id);
    anexosSemSoma.push(...semSoma.map((nome) => `${os.numero_os}: ${nome}`));
  }
  return { regravados: finalizadas.length, anexosSemSoma };
}

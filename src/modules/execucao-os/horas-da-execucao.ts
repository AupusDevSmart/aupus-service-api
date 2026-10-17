import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, type tecnicos_os } from '@prisma/client';
import { PAPEIS } from '@/core/modules/permissions/matriz-de-permissoes';
import { pessoasQuePodemAtuar } from '@/modules/programacao-os/pessoas-da-os';

/**
 * As horas-homem reais da OS (SN-61).
 *
 * Antes `tecnicos_os.horas_trabalhadas` existia e nada gravava: o custo de mão
 * de obra saía da hora ESTIMADA, e o "tempo de execução" era o fim menos o
 * início, com as pausas dentro e sem dizer quantas pessoas trabalharam. Agora,
 * ao executar, cada técnico escalado recebe as horas que trabalhou (0 = não
 * foi), quem entrou na hora também, e o HH real é a soma.
 */

/** O que para o trabalho e o que o retoma, na trilha da OS. */
const PARA = new Set(['PAUSA', 'EXECUCAO']);
const RETOMA = new Set(['RETOMADA', 'REABERTURA']);
/** O que a listagem traz da trilha para o tempo efetivo (o resto não muda a conta). */
export const MARCOS_DO_TEMPO = [...PARA, ...RETOMA];

/** Quem entrou na execução sem estar escalado leva o tipo de usuário como especialidade. */
const ESPECIALIDADE_DO_PAPEL = new Map(PAPEIS.map((p) => [p.name, p.nome_exibido]));

/** As pessoas que podem entrar na execução, como a rota da OS devolve: sem e-mail nem papel. */
export interface PessoasDaOS {
  equipe: { id: string; nome: string }[];
  apoio: { id: string; nome: string }[];
}

export interface MarcoDaTrilha {
  acao: string;
  data: Date;
}

/**
 * Minutos de trabalho entre o início e o fim, sem as pausas registradas.
 *
 * Fica de fora o que vai de uma PAUSA até a RETOMADA e de uma EXECUCAO até a
 * REABERTURA (a OS executada, auditada e reaberta não estava em trabalho no
 * meio). Pausa sem retomada vai até o fim: executar da OS pausada não conta o
 * tempo parado. Os intervalos são cortados no início e no fim — o início pode
 * ter sido informado antes do clique, e a trilha guarda a hora do clique.
 */
export function minutosEfetivos(inicio: Date | null, fim: Date | null, trilha: MarcoDaTrilha[]): number | null {
  if (!inicio || !fim) return null;
  const de = inicio.getTime();
  const ate = fim.getTime();
  if (ate <= de) return 0;

  let parado = 0;
  const descontar = (a: number, b: number) => {
    const ini = Math.max(a, de);
    const fimDoIntervalo = Math.min(b, ate);
    if (fimDoIntervalo > ini) parado += fimDoIntervalo - ini;
  };

  let paradoDesde: number | null = null;
  for (const marco of [...trilha].sort((a, b) => a.data.getTime() - b.data.getTime())) {
    const quando = marco.data.getTime();
    if (PARA.has(marco.acao) && paradoDesde === null) paradoDesde = quando;
    else if (RETOMA.has(marco.acao) && paradoDesde !== null) {
      descontar(paradoDesde, quando);
      paradoDesde = null;
    }
  }
  if (paradoDesde !== null) descontar(paradoDesde, ate);

  return Math.round((ate - de - parado) / 60_000);
}

/** "3h", "2h30", "45min" — como a tela mostra. */
export function horasEmTexto(horas: number): string {
  const minutos = Math.round(horas * 60);
  const h = Math.floor(minutos / 60);
  const min = minutos % 60;
  if (minutos === 0) return '0h';
  if (h === 0) return `${min}min`;
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`;
}

const somar = (valores: number[]) => Math.round(valores.reduce((total, v) => total + v, 0) * 100) / 100;

/** HH real (null enquanto ninguém registrou) e HH estimado da equipe. */
export function horasDaEquipe(
  tecnicos: Pick<tecnicos_os, 'horas_estimadas' | 'horas_trabalhadas'>[],
): { hh_real: number | null; hh_estimado: number } {
  const registradas = tecnicos.filter((t) => t.horas_trabalhadas !== null).map((t) => Number(t.horas_trabalhadas));
  return {
    hh_real: registradas.length > 0 ? somar(registradas) : null,
    hh_estimado: somar(tecnicos.map((t) => Number(t.horas_estimadas))),
  };
}

export interface HorasDoPedido {
  horas_dos_tecnicos?: { id: string; horas: number }[];
  tecnicos_extras?: { tecnico_id: string; horas: number }[];
}

type TecnicoDaOS = Pick<tecnicos_os, 'id' | 'nome' | 'especialidade' | 'tecnico_id' | 'custo_hora' | 'horas_trabalhadas'>;

export interface GravacaoDasHoras {
  atualizacoes: { id: string; data: Prisma.tecnicos_osUpdateInput }[];
  novos: Omit<Prisma.tecnicos_osCreateManyInput, 'os_id'>[];
  /** O que entra na trilha; null quando nada mudou (reexecutar com as mesmas horas). */
  resumo: string | null;
}

const nomeDoTecnico = (t: Pick<TecnicoDaOS, 'nome' | 'especialidade'>) => t.nome?.trim() || `${t.especialidade} (sem pessoa)`;
/**
 * Em centavos, metade para cima, em Decimal — a mesma conta no custo da linha
 * e no custo real da OS. Em float, 0,5 h x R$ 2,01 dava 1,00 na linha (1.005 *
 * 100 = 100.49999...) e o banco arredondava o custo da OS para 1,01.
 */
export const emCentavos = (valor: Prisma.Decimal) => valor.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const custo = (horas: number, custoHora: Prisma.Decimal | null) =>
  custoHora === null ? undefined : emCentavos(custoHora.mul(horas));

/**
 * O que gravar das horas ao executar. Toda linha da equipe precisa de horas —
 * 0 quando a pessoa não foi —, como toda tarefa pendente precisa de motivo: o
 * que não pode é o HH sair da estimativa calado. Quem entrou na hora vem pelo
 * usuário e tem de estar na lista que a tela oferece (a regra de quem pode ser
 * escalado, SN-31). Fora dela, a recusa não diz quem é nem por quê: o motivo
 * da programação ("X é cliente", "X está inativo") deixaria quem executa
 * descobrir nome e situação de qualquer usuário pelo id.
 */
export async function gravacaoDasHoras(
  prisma: Pick<Prisma.TransactionClient, '$queryRaw'>,
  plantaId: string | null,
  equipe: TecnicoDaOS[],
  pedido: HorasDoPedido,
): Promise<GravacaoDasHoras> {
  const porId = new Map(equipe.map((t) => [t.id.trim(), t]));
  const horas = new Map<string, number>();
  for (const { id, horas: h } of pedido.horas_dos_tecnicos ?? []) {
    const chave = id.trim();
    if (!porId.has(chave)) throw new NotFoundException('Técnico não encontrado nesta OS: recarregue a tela.');
    if (horas.has(chave)) throw new BadRequestException(`As horas de ${nomeDoTecnico(porId.get(chave)!)} vieram duas vezes.`);
    horas.set(chave, h);
  }
  const semHoras = equipe.filter((t) => !horas.has(t.id.trim()));
  if (semHoras.length > 0) {
    throw new BadRequestException(
      `Informe as horas trabalhadas de ${semHoras.map(nomeDoTecnico).join(', ')} (0 se não trabalhou).`,
    );
  }

  const extras = pedido.tecnicos_extras ?? [];
  const idsExtras = extras.map((e) => e.tecnico_id.trim());
  const naEquipe = new Map(equipe.filter((t) => t.tecnico_id?.trim()).map((t) => [t.tecnico_id!.trim(), t]));
  const repetidos = idsExtras.filter((id, i) => idsExtras.indexOf(id) !== i);
  if (repetidos.length > 0) throw new BadRequestException('A mesma pessoa veio duas vezes entre quem entrou na execução.');
  const jaEscalados = idsExtras.filter((id) => naEquipe.has(id));
  if (jaEscalados.length > 0) {
    throw new BadRequestException(
      `${jaEscalados.map((id) => nomeDoTecnico(naEquipe.get(id)!)).join(', ')} já está na equipe: informe as horas na linha de cada um.`,
    );
  }
  if (extras.some((e) => e.horas <= 0)) {
    throw new BadRequestException('Quem entrou na execução precisa de horas maiores que zero.');
  }
  const pessoas = new Map<string, { id: string; nome: string; papel: string }>();
  if (extras.length > 0) {
    const { equipe: daPlanta, apoio } = await pessoasQuePodemAtuar(prisma, plantaId);
    for (const p of [...daPlanta, ...apoio]) pessoas.set(p.id.trim(), p);
    if (idsExtras.some((id) => !pessoas.has(id))) {
      throw new BadRequestException('Uma das pessoas registradas não pode atuar nesta OS: escolha pela lista da tela.');
    }
  }

  const atualizacoes = equipe.map((t) => {
    const h = horas.get(t.id.trim())!;
    return { id: t.id, data: { horas_trabalhadas: h, presente: h > 0, custo_total: custo(h, t.custo_hora) } };
  });
  const novos = extras.map((e) => {
    const pessoa = pessoas.get(e.tecnico_id.trim())!;
    return {
      nome: pessoa.nome,
      especialidade: ESPECIALIDADE_DO_PAPEL.get(pessoa.papel) ?? 'Entrou na execução',
      tecnico_id: pessoa.id,
      horas_estimadas: 0,
      horas_trabalhadas: e.horas,
      presente: true,
    };
  });

  const mudou = extras.length > 0 || equipe.some((t) => t.horas_trabalhadas === null || Number(t.horas_trabalhadas) !== horas.get(t.id.trim()));
  const linhas = [
    ...equipe.map((t) => `${nomeDoTecnico(t)} ${horasEmTexto(horas.get(t.id.trim())!)}`),
    ...novos.map((n) => `${n.nome} ${horasEmTexto(n.horas_trabalhadas)} (entrou na execução)`),
  ];
  const total = somar([...horas.values(), ...extras.map((e) => e.horas)]);
  return {
    atualizacoes,
    novos,
    resumo: mudou && linhas.length > 0 ? `Horas trabalhadas (${horasEmTexto(total)} no total): ${linhas.join('; ')}.` : null,
  };
}

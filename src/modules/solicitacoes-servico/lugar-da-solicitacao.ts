import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PermissionScopeService, Prisma, PrismaService, ScopedUser } from '@/core';
import { plantasDosEquipamentos } from '@/core/modules/auth/planta-dos-equipamentos';

export interface LugarDaSolicitacao {
  planta_id?: string | null;
  unidade_id?: string | null;
  equipamento_id?: string | null;
}

/**
 * A planta da solicitação — a informada ou a da unidade — e a coerência do
 * lugar: a unidade e o equipamento têm de ser dessa planta.
 *
 * Para quem tem escopo, a planta, a unidade ou o equipamento de fora respondem
 * como o que não existe: o escopo é conferido antes da busca e com a mesma
 * mensagem do "não encontrado" (SN-57). Antes a ordem era a inversa, e o texto
 * diferente contava que o id de outra planta existe.
 *
 * Antes também a unidade só era lida quando vinha sem a planta, e o equipamento
 * nunca: com as duas, a unidade (ou o equipamento) de outra planta passava. E a
 * edição não conferia nada — a solicitação podia ser levada para uma planta
 * fora do escopo de quem editava.
 */
export async function plantaDaSolicitacao(
  prisma: PrismaService,
  escopo: PermissionScopeService,
  lugar: LugarDaSolicitacao,
  user?: ScopedUser,
): Promise<string | null> {
  let plantaId = lugar.planta_id?.trim() || undefined;
  const unidadeId = lugar.unidade_id?.trim();
  const equipamentoId = lugar.equipamento_id?.trim();

  if (unidadeId) {
    const naoEncontrada = `Unidade com ID ${unidadeId} não encontrada`;
    const unidade = await prisma.unidades.findUnique({ where: { id: unidadeId }, select: { planta_id: true } });
    if (!unidade) throw new NotFoundException(naoEncontrada);
    if (user) await escopo.assertPlantaInScope(unidade.planta_id, user, naoEncontrada);
    const daUnidade = unidade.planta_id?.trim();
    if (plantaId && daUnidade !== plantaId) throw new BadRequestException('A unidade informada não é da planta informada.');
    plantaId = plantaId || daUnidade;
  }

  if (!plantaId) {
    // Sem planta (28/out/2026): a equipe cadastra a solicitação só com o cliente em
    // texto, e a planta se escolhe ao programar. Quem tem escopo por planta (o
    // cliente, o técnico) escolhe a dele: sem ela, nem ele veria o que abriu
    if (equipamentoId) throw new BadRequestException('É necessário informar a planta ou a instalação do equipamento.');
    if (escopo.isScoped(await escopo.getScope(user))) throw new BadRequestException('Escolha a planta da solicitação.');
    return null;
  }

  const plantaNaoEncontrada = `Planta com ID ${plantaId} não encontrada ou foi deletada`;
  if (user) await escopo.assertPlantaInScope(plantaId, user, plantaNaoEncontrada);
  const planta = await prisma.plantas.findFirst({ where: { id: plantaId, deleted_at: null }, select: { id: true } });
  if (!planta) throw new NotFoundException(plantaNaoEncontrada);

  if (equipamentoId) {
    const [doEquipamento] = await plantasDosEquipamentos(prisma, [equipamentoId]);
    if (user) await escopo.assertPlantaInScope(doEquipamento ?? null, user, 'Equipamento não encontrado');
    if (!doEquipamento) throw new NotFoundException('Equipamento não encontrado');
    if (doEquipamento !== plantaId) throw new BadRequestException('O equipamento informado não é da planta informada.');
  }

  return plantaId;
}

/**
 * A solicitação diz de quem é: pela planta ou, sem ela, pelo nome do cliente
 * (28/out/2026). Sem os dois, a lista e o PDF da proposta sairiam sem dono.
 */
export function exigirQuemPediu(plantaId: string | null | undefined, clienteNome: string | null | undefined): void {
  if (!plantaId?.trim() && !clienteNome?.trim()) {
    throw new BadRequestException('Sem planta, informe o nome do cliente: a solicitação precisa dizer de quem é.');
  }
}

/** A edição mexeu no lugar? Só aí ele é conferido: dado antigo incoerente não trava a edição de outro campo. */
export function mudouOLugar(pedido: LugarDaSolicitacao, atual: LugarDaSolicitacao): boolean {
  const igual = (a?: string | null, b?: string | null) => (a?.trim() || null) === (b?.trim() || null);
  return (['planta_id', 'unidade_id', 'equipamento_id'] as const).some(
    (campo) => pedido[campo] !== undefined && !igual(pedido[campo], atual[campo]),
  );
}

/**
 * Os ids do lugar aparados, como são gravados. As colunas da solicitação são
 * texto e os ids de planta e unidade são Char(26): o id antigo, de 25
 * caracteres, chegava da tela com o espaço do fim e era gravado assim — e o
 * filtro por relação (a busca pelo nome da instalação, SN-77) compara texto
 * com espaço contra o char sem ele, e não achava a solicitação.
 */
export function comOLugarAparado<T extends Record<string, unknown>>(dados: T): T {
  const aparados = { ...dados } as Record<string, unknown>;
  for (const campo of ['planta_id', 'unidade_id', 'equipamento_id', 'proprietario_id']) {
    const valor = aparados[campo];
    if (typeof valor === 'string') aparados[campo] = valor.trim() || null;
  }
  return aparados as T;
}

type ComOsCadastros = Pick<Prisma.TransactionClient, 'equipamentos' | 'unidades' | 'usuarios'>;

const EQUIPAMENTO_DA_SOLICITACAO = { id: true, nome: true, tag: true, tipo_equipamento: true, unidade_id: true } as const;
const UNIDADE_DA_SOLICITACAO = { id: true, nome: true, tipo: true, cidade: true, estado: true, potencia: true, status: true } as const;
const PESSOA_DA_SOLICITACAO = { id: true, nome: true, email: true } as const;

type EquipamentoDaSolicitacao = Prisma.equipamentosGetPayload<{ select: typeof EQUIPAMENTO_DA_SOLICITACAO }>;
type UnidadeDaSolicitacao = Prisma.unidadesGetPayload<{ select: typeof UNIDADE_DA_SOLICITACAO }>;
type PessoaDaSolicitacao = Prisma.usuariosGetPayload<{ select: typeof PESSOA_DA_SOLICITACAO }>;

interface IdsDaSolicitacao {
  equipamento_id?: string | null;
  unidade_id?: string | null;
  proprietario_id?: string | null;
  solicitante_id?: string | null;
}

export interface RelacoesDaSolicitacao {
  equipamento: EquipamentoDaSolicitacao | null;
  unidade: UnidadeDaSolicitacao | null;
  proprietario: PessoaDaSolicitacao | null;
  solicitante: PessoaDaSolicitacao | null;
}

/**
 * O equipamento, a unidade e as pessoas de cada solicitação por consulta
 * própria, com o id aparado, uma por tabela. Com o lugar gravado aparado
 * (SN-77), o `include` — que o Prisma casa em JavaScript, depois de buscar —
 * perdia o registro de id antigo (25 caracteres no Char(26), que volta com o
 * espaço): a resposta saía com `equipamento: null` e a programação criada da
 * solicitação, com "N/A" no ativo. O `in` é SQL e, no Char(26), casa com e sem
 * o espaço.
 */
export async function comAsRelacoes<T extends IdsDaSolicitacao>(
  prisma: ComOsCadastros,
  solicitacoes: T[],
): Promise<(T & RelacoesDaSolicitacao)[]> {
  const aparados = (...campos: (keyof IdsDaSolicitacao)[]) => [
    ...new Set(solicitacoes.flatMap((s) => campos.map((c) => s[c]?.trim())).filter((id): id is string => Boolean(id))),
  ];
  const idsDeEquipamento = aparados('equipamento_id');
  const idsDeUnidade = aparados('unidade_id');
  const idsDePessoa = aparados('proprietario_id', 'solicitante_id');
  const [equipamentos, unidades, pessoas] = await Promise.all([
    idsDeEquipamento.length
      ? prisma.equipamentos.findMany({ where: { id: { in: idsDeEquipamento } }, select: EQUIPAMENTO_DA_SOLICITACAO })
      : Promise.resolve<EquipamentoDaSolicitacao[]>([]),
    idsDeUnidade.length
      ? prisma.unidades.findMany({ where: { id: { in: idsDeUnidade }, deleted_at: null }, select: UNIDADE_DA_SOLICITACAO })
      : Promise.resolve<UnidadeDaSolicitacao[]>([]),
    idsDePessoa.length
      ? prisma.usuarios.findMany({ where: { id: { in: idsDePessoa } }, select: PESSOA_DA_SOLICITACAO })
      : Promise.resolve<PessoaDaSolicitacao[]>([]),
  ]);
  const porId = <R extends { id: string }>(linhas: R[]) => new Map(linhas.map((r) => [r.id.trim(), { ...r, id: r.id.trim() }]));
  const [equipamentoPorId, unidadePorId, pessoaPorId] = [porId(equipamentos), porId(unidades), porId(pessoas)];
  const achar = <R>(mapa: Map<string, R>, id?: string | null) => (id && mapa.get(id.trim())) || null;
  return solicitacoes.map((s) => ({
    ...s,
    equipamento: achar(equipamentoPorId, s.equipamento_id),
    unidade: achar(unidadePorId, s.unidade_id),
    proprietario: achar(pessoaPorId, s.proprietario_id),
    solicitante: achar(pessoaPorId, s.solicitante_id),
  }));
}

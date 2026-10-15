import { Prisma } from '@prisma/client';

export const RECURSOS = ['usuarios', 'plantas', 'unidades', 'equipamentos'] as const;
export type Recurso = (typeof RECURSOS)[number];

export function ehRecurso(v: string): v is Recurso {
  return (RECURSOS as readonly string[]).includes(v);
}

/**
 * O que NUNCA atravessa a fronteira.
 *
 * Lista de NEGACAO, derivada do DMMF em vez de uma lista de campos permitidos
 * escrita a mao. Ja custou caro neste projeto: o endpoint de lote de UAR tinha
 * uma lista de permissao e perdia 33 de 46 colunas em silencio, porque cada
 * coluna nova nascia fora dela. Com negacao, coluna nova viaja sozinha e o
 * esquecimento erra para o lado seguro.
 */
const NUNCA_VIAJAM: Record<Recurso, string[]> = {
  usuarios: [
    // Credencial nao se replica. Nunca.
    'senha',
    'remember_token',
    // Estado da senha provisoria (SN-34): e da credencial, fica com ela.
    'deve_trocar_senha',
    // `role` e a coluna legada que espelha o Spatie. Privilegio nao viaja junto
    // com cadastro: os dois bancos tem 6 roles e 39 permissions com guards
    // `web`/`api` misturados, e propagar isso transformaria um botao de
    // compartilhar em escalada de acesso. Quem recebe atribui papel no destino.
    'role',
    // Apontam para tabelas que nao estao sob sincronizacao. Levar o id sem
    // levar a linha cria referencia pendurada — que nao da erro, so devolve
    // nulo quando alguem for ler.
    'concessionaria_atual_id',
    'organizacao_atual_id',
    'manager_id',
    'created_by',
    'deleted_by',
  ],
  plantas: [],
  unidades: [],
  equipamentos: [
    // Existem so no Service. O receptor ja descarta o que nao reconhece, mas
    // nao mandar e mais honesto do que mandar para ser jogado fora.
    'ativo_funcional_id',
    'ativo_na_posicao',
  ],
};

/**
 * O que precisa existir do outro lado antes do registro poder chegar.
 *
 * A sincronizacao RECUSA quando falta dependencia, em vez de arrastar junto o
 * que falta. Um clique em "compartilhar equipamento" que silenciosamente copia
 * um usuario e os privilegios dele para o outro produto e um buraco de
 * seguranca, nao uma conveniencia.
 */
export interface Dependencia {
  campo: string;
  /** Tabela onde procurar. Nem toda dependencia e um recurso sincronizavel. */
  tabela: TabelaPorNome;
  comoChamar: string;
}

/** As tabelas que a sincronizacao le pelo nome: os recursos e o que eles referenciam. */
export type TabelaPorNome = Recurso | 'tipos_equipamentos';

/**
 * O pedaco de um delegate do Prisma que a sincronizacao usa quando a tabela
 * so se conhece em runtime. A linha e um registro solto — e assim que o modulo
 * a trata (montarPayload / filtrarParaEsteBanco andam pelo DMMF, nao pelo tipo).
 */
export interface DelegatePorNome {
  findUnique(args: { where: { id: string }; select?: Record<string, true> }): Promise<Record<string, unknown> | null>;
  findFirst(args: { where: { id: string }; select?: Record<string, true> }): Promise<Record<string, unknown> | null>;
  updateMany(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ count: number }>;
  upsert(args: {
    where: { id: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
}

/**
 * O delegate da tabela pelo nome. Cada model gerado tem a propria assinatura
 * generica, e a uniao delas nao e chamavel no TypeScript; daqui para fora a
 * chamada e pela forma comum acima.
 */
export function delegatePorNome(tx: Prisma.TransactionClient, tabela: TabelaPorNome): DelegatePorNome {
  // Via unknown: o `SelectSubset` dos delegates gerados nao e comparavel com
  // nenhuma forma escrita a mao, e nao ha interface comum exportada pelo Prisma.
  return tx[tabela] as unknown as DelegatePorNome;
}

export const DEPENDENCIAS: Record<Recurso, Dependencia[]> = {
  usuarios: [],
  plantas: [{ campo: 'proprietario_id', tabela: 'usuarios', comoChamar: 'o proprietário' }],
  unidades: [{ campo: 'planta_id', tabela: 'plantas', comoChamar: 'a planta' }],
  equipamentos: [
    { campo: 'unidade_id', tabela: 'unidades', comoChamar: 'a instalação' },
    { campo: 'equipamento_pai_id', tabela: 'equipamentos', comoChamar: 'o equipamento pai' },
    // O catalogo esta sincronizado hoje (37 tipos e 20 categorias com os mesmos
    // ids nos dois bancos), mas conferir e barato e o dia em que divergir o erro
    // sera claro em vez de virar equipamento sem categoria do outro lado.
    { campo: 'tipo_equipamento_id', tabela: 'tipos_equipamentos', comoChamar: 'o tipo de equipamento' },
  ],
};

/** Os campos escalares do model, menos os que nunca viajam. */
export function camposQueViajam(recurso: Recurso): string[] {
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === recurso);
  if (!model) throw new Error(`Recurso sem model no schema: ${recurso}`);

  const proibidos = new Set(NUNCA_VIAJAM[recurso]);
  return model.fields
    .filter(f => f.kind === 'scalar' && !proibidos.has(f.name))
    .map(f => f.name);
}

/**
 * Monta o payload de saida a partir da linha do banco.
 *
 * Ids saem TRIMADOS: as tabelas sao `char(26)` e devolvem com padding, e mandar
 * o padding pela rede faria o outro lado gravar um id diferente do proprio id.
 * `Date` vira ISO e `Decimal`/`BigInt` viram string porque JSON nao tem os tres.
 */
export function montarPayload(recurso: Recurso, linha: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const campo of camposQueViajam(recurso)) {
    const v = linha[campo];
    if (v === undefined) continue;

    if (v === null) payload[campo] = null;
    else if (v instanceof Date) payload[campo] = v.toISOString();
    else if (typeof v === 'bigint') payload[campo] = v.toString();
    else if (typeof v === 'object' && 'toFixed' in v && typeof v.toFixed === 'function') payload[campo] = v.toString();
    else if (typeof v === 'string' && campo.endsWith('_id')) payload[campo] = v.trim();
    else payload[campo] = v;
  }

  if (typeof payload.id === 'string') payload.id = payload.id.trim();
  return payload;
}

/**
 * Filtra o payload recebido contra o schema DESTE backend.
 *
 * O remetente nao conhece a forma do destinatario, e nao deve conhecer — e por
 * isso que a sincronizacao passa por HTTP e nao por escrita cruzada no banco.
 * Campo que este lado nao tem e descartado aqui, sem erro: e assim que o
 * equipamento do Service (55 colunas) entra no NexOn (53) sem ninguem precisar
 * manter um tradutor dos dois lados.
 */
export function filtrarParaEsteBanco(
  recurso: Recurso,
  payload: Record<string, unknown>,
): { dados: Record<string, unknown>; ignorados: string[] } {
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === recurso);
  if (!model) throw new Error(`Recurso sem model no schema: ${recurso}`);

  const conhecidos = new Map(model.fields.filter(f => f.kind === 'scalar').map(f => [f.name, f]));
  const proibidos = new Set(NUNCA_VIAJAM[recurso]);

  const dados: Record<string, unknown> = {};
  const ignorados: string[] = [];

  for (const [campo, valor] of Object.entries(payload)) {
    const f = conhecidos.get(campo);
    // Um remetente comprometido nao consegue gravar senha por aqui: a barreira
    // vale nos DOIS sentidos, nao so na saida.
    if (!f || proibidos.has(campo)) { ignorados.push(campo); continue; }

    if (valor === null) { dados[campo] = null; continue; }

    // DateTime, BigInt e Decimal chegam como texto: e como montarPayload os manda
    switch (f.type) {
      case 'DateTime': dados[campo] = new Date(valor as string); break;
      case 'BigInt':   dados[campo] = BigInt(valor as string); break;
      case 'Decimal':  dados[campo] = new Prisma.Decimal(valor as string); break;
      case 'Int':      dados[campo] = Number(valor); break;
      default:         dados[campo] = typeof valor === 'string' && campo.endsWith('_id') ? valor.trim() : valor;
    }
  }

  return { dados, ignorados };
}

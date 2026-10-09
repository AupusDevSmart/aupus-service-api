/**
 * Acha um registro de outro cadastro pelo que a linha da planilha traz.
 *
 * O nome casa sem caixa, sem acento e sem espaço sobrando ("Eletrica" acha
 * "Elétrica"). Nome que casa com dois registros é erro, não sorteio: a
 * planilha não diz qual dos dois.
 *
 * A planilha exportada leva também o ID do item, e com ele o nome repetido
 * deixa de ser problema — mas só quando o nome da linha ainda é o daquele ID.
 * Nome trocado com o ID antigo ao lado é troca de item feita de propósito
 * (por uma pessoa ou por uma IA que não sabe apagar a coluna), e aí vale o
 * nome.
 */
export class CatalogoPorNome {
  private readonly porChave = new Map<string, string[]>();
  private readonly porCodigo = new Map<string, string>();
  private readonly chavePorId = new Map<string, string>();

  constructor(
    itens: Array<{ id: string; nome: string | null; codigo?: string | null }>,
    private readonly oQue: string,
    /** Para a concordância: "uma planta chamada", "um recurso chamado". */
    private readonly genero: 'm' | 'f' = 'm',
  ) {
    for (const item of itens) {
      const id = item.id.trim();
      const k = chave(item.nome);
      this.porChave.set(k, [...(this.porChave.get(k) ?? []), id]);
      this.chavePorId.set(id, k);
      if (item.codigo?.trim()) this.porCodigo.set(chave(item.codigo), id);
    }
  }

  /**
   * O id do item, ou a frase do erro no lugar dele.
   *
   * `idsDaLinha` são os IDs que a linha exportada trouxe ao lado do nome (um,
   * ou vários numa célula de lista): vale o que tiver este nome. O texto pode
   * ser também o código do item, quando o cadastro tem um.
   */
  procurar(texto: string | null | undefined, idsDaLinha: Array<string | null | undefined> = []): string | { erro: string } {
    const nome = texto?.trim() ?? '';
    const [o, um, chamado] = this.genero === 'f' ? ['a', 'uma', 'chamada'] : ['o', 'um', 'chamado'];
    if (!nome) return { erro: `Informe ${o} ${this.oQue}.` };

    const k = chave(nome);
    for (const id of idsDaLinha) {
      const limpo = id?.trim();
      if (limpo && this.chavePorId.get(limpo) === k) return limpo;
    }

    const ids = this.porChave.get(k) ?? [];
    if (ids.length === 1) return ids[0];

    const peloCodigo = this.porCodigo.get(k);
    if (peloCodigo) return peloCodigo;

    if (ids.length === 0) {
      return {
        erro: `Não existe ${this.oQue} ${chamado} "${nome}". Use o nome exatamente como na aba REFERÊNCIAS.`,
      };
    }

    return {
      erro: `Há mais de ${um} ${this.oQue} ${chamado} "${nome}". Na linha exportada, mantenha a coluna de ID que veio com ela; em linha nova, renomeie um deles no cadastro antes de importar.`,
    };
  }
}

/** Sem acento, sem caixa e sem espaço sobrando — a mesma chave que o front usa. */
export function chave(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Lista separada por ";" numa célula (ex.: as plantas de um feriado). */
export function listaDaCelula(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof valor !== 'string') return [];
  return valor
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean);
}

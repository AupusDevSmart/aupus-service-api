/**
 * Sorteio com semente fixa (mulberry32): rodar de novo dá o mesmo cenário,
 * com as datas contadas a partir do dia em que roda.
 */
export class Sorteio {
  private estado: number;

  constructor(semente: number) {
    this.estado = semente >>> 0;
  }

  /** De 0 (inclusive) a 1 (exclusive) */
  proximo(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro de `min` a `max`, os dois inclusive */
  inteiro(min: number, max: number): number {
    return min + Math.floor(this.proximo() * (max - min + 1));
  }

  /** Número de `min` a `max` com `casas` decimais */
  decimal(min: number, max: number, casas = 2): number {
    const fator = 10 ** casas;
    return Math.round((min + this.proximo() * (max - min)) * fator) / fator;
  }

  chance(probabilidade: number): boolean {
    return this.proximo() < probabilidade;
  }

  um<T>(itens: readonly T[]): T {
    if (itens.length === 0) throw new Error('Sorteio de lista vazia');
    return itens[Math.floor(this.proximo() * itens.length)];
  }

  /** `n` itens distintos, na ordem sorteada */
  alguns<T>(itens: readonly T[], n: number): T[] {
    const copia = [...itens];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(this.proximo() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia.slice(0, Math.min(n, copia.length));
  }
}

import type { Cenario } from './cenario';
import { DIAS_UTEIS, FERIADOS } from './dados/agenda';
import { DIA_MS, diaDaSemana, diaDe } from './tempo';

/**
 * A fila de acontecimentos do ano, na ordem do calendário: cada um roda no
 * relógio do seed (os carimbos vão para a data dele) e pode marcar o próximo
 * passo. O que cairia depois de agora não acontece: é assim que a OS de hoje
 * fica em execução e a da semana que vem, pendente.
 */
interface Acontecimento {
  quando: Date;
  ordem: number;
  rotulo: string;
  fazer: () => Promise<void>;
}

export class LinhaDoTempo {
  private fila: Acontecimento[] = [];
  private contador = 0;
  feitos = 0;
  /** O que ficou para depois de agora (não acontece; é o futuro do cenário) */
  adiados = 0;

  constructor(private readonly c: Cenario) {}

  marcar(desejado: Date, rotulo: string, fazer: () => Promise<void>): void {
    if (Number.isNaN(desejado.getTime())) throw new Error(`Data inválida para "${rotulo}"`);
    // O passo seguinte nunca volta no tempo: no mínimo, um minuto depois do que o marcou
    const atual = this.c.relogio.passoEmCurso();
    const piso = atual ? atual.getTime() + 60_000 : 0;
    const quando = desejado.getTime() < piso ? new Date(piso) : desejado;
    if (quando.getTime() > this.c.agora.getTime()) {
      this.adiados++;
      return;
    }
    const item = { quando, ordem: this.contador++, rotulo, fazer };
    // Inserção ordenada: poucos milhares de itens, e a ordem estável desempata
    let i = this.fila.length;
    while (i > 0 && (this.fila[i - 1].quando > quando || (this.fila[i - 1].quando.getTime() === quando.getTime() && this.fila[i - 1].ordem > item.ordem))) i--;
    this.fila.splice(i, 0, item);
  }

  async rodar(): Promise<void> {
    while (this.fila.length > 0) {
      const proximo = this.fila.shift()!;
      try {
        await this.c.relogio.em(proximo.quando, async () => {
          await proximo.fazer();
          // O aviso do acontecimento nasce na data dele, como nasceria com a API no ar
          await this.c.s.notificacoes.processarPendentes();
        });
      } catch (erro) {
        const onde = `${proximo.rotulo} (${proximo.quando.toISOString()})`;
        if (!(erro instanceof Error)) throw new Error(`${onde}: ${String(erro)}`);
        // O próprio erro, com o passo na mensagem: o tipo, o stack e a resposta do service ficam
        erro.message = `${onde}: ${erro.message}`;
        throw erro;
      }
      this.feitos++;
      if (this.feitos % 250 === 0) this.c.log(`    ... ${this.feitos} acontecimentos (${diaDe(proximo.quando)})`);
    }
  }
}

/** Dia útil da planta: a regra de dias úteis dela (ou a geral) e os feriados que valem para ela */
export function ehDiaUtil(planta: string, dia: Date): boolean {
  const regra = DIAS_UTEIS.find((r) => r.plantas?.includes(planta)) ?? DIAS_UTEIS.find((r) => !r.plantas)!;
  const semana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
  if (!regra.dias[semana[diaDaSemana(dia)]]) return false;
  const texto = diaDe(dia);
  return !FERIADOS.some(
    (f) => (!f.plantas || f.plantas.includes(planta)) && (f.data === texto || (f.recorrente && f.data.slice(5) === texto.slice(5))),
  );
}

/** O primeiro dia útil da planta a partir do dia dado (ele mesmo, se for) */
export function proximoDiaUtil(planta: string, dia: Date): Date {
  let d = dia;
  for (let i = 0; i < 15 && !ehDiaUtil(planta, d); i++) d = new Date(d.getTime() + DIA_MS);
  return d;
}

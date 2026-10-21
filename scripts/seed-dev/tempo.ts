/** Brasília é UTC-3 o ano inteiro (sem horário de verão desde 2019) */
const FUSO_MS = 3 * 60 * 60 * 1000;
export const DIA_MS = 24 * 60 * 60 * 1000;
export const HORA_MS = 60 * 60 * 1000;

/** O dia de Brasília de um instante, como texto AAAA-MM-DD */
export function diaDe(instante: Date): string {
  return new Date(instante.getTime() - FUSO_MS).toISOString().slice(0, 10);
}

/** O instante de um dia (AAAA-MM-DD ou o dia de um instante) a uma hora de Brasília */
export function as(dia: string | Date, hora: string): Date {
  const texto = typeof dia === 'string' ? dia : diaDe(dia);
  const [h, m = '00', s = '00'] = hora.split(':');
  return new Date(`${texto}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}-03:00`);
}

export const somarDias = (instante: Date, dias: number) => new Date(instante.getTime() + dias * DIA_MS);
export const somarHoras = (instante: Date, horas: number) => new Date(instante.getTime() + horas * HORA_MS);

/** "HH:mm" de Brasília de um instante */
export function horaDe(instante: Date): string {
  return new Date(instante.getTime() - FUSO_MS).toISOString().slice(11, 16);
}

/** Dia da semana em Brasília (0 = domingo) */
export function diaDaSemana(instante: Date): number {
  return new Date(instante.getTime() - FUSO_MS).getUTCDay();
}

/** RFC 3339 com fuso, como o `@InstanteComFuso` pede */
export const instante = (data: Date) => data.toISOString();

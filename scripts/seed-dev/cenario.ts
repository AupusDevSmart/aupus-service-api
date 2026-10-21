import type { PrismaService, ScopedUser } from '@/core';
import type { Servicos } from './ambiente';
import type { Relogio } from './relogio';
import type { Sorteio } from './sorteio';
import type { Papel } from './dados/pessoas';
import type { EquipamentoDoSeed, PlantaDoSeed, UnidadeDoSeed } from './dados/plantas';

export interface Pessoa {
  id: string;
  nome: string;
  papel: Papel;
  /** Como o controller passa ao service: o escopo e a hierarquia valem para o seed também */
  usuario: ScopedUser & { id: string };
}

export interface Unidade {
  id: string;
  nome: string;
  dados: UnidadeDoSeed;
}

export interface Planta {
  id: string;
  chave: string;
  nome: string;
  dados: PlantaDoSeed;
  unidades: Map<string, Unidade>;
}

export interface Equipamento {
  id: string;
  nome: string;
  planta: Planta;
  unidade: Unidade;
  categoria: string;
  modelo: string;
  posicaoId: string;
  dados: EquipamentoDoSeed;
}

/** O que o seed já criou, para as etapas seguintes acharem pelo nome */
export interface Cenario {
  prisma: PrismaService;
  s: Servicos;
  relogio: Relogio;
  sorteio: Sorteio;
  log: (linha: string) => void;
  /** O instante real em que o seed começou: nada do cenário passa dele */
  agora: Date;
  /** O primeiro dia da história (um ano antes de hoje) */
  inicio: Date;
  pessoas: Map<string, Pessoa>;
  plantas: Map<string, Planta>;
  equipamentos: Map<string, Equipamento>;
  categorias: Map<string, string>;
  modelos: Map<string, { id: string; categoria: string; fabricante: string; nome: string }>;
  recursos: Map<string, string>;
  maquinarios: Map<string, string>;
  instrucoes: Map<string, string>;
  templates: Map<string, string>;
  veiculos: Map<string, { id: string; nome: string; km: number }>;
}

export const chaveDoEquipamento = (planta: string, unidade: string, nome: string) => `${planta}|${unidade}|${nome}`;

export function pessoa(cenario: Cenario, chave: string): Pessoa {
  const p = cenario.pessoas.get(chave);
  if (!p) throw new Error(`Pessoa do seed não encontrada: ${chave}`);
  return p;
}

export function equipamento(cenario: Cenario, planta: string, unidade: string, nome: string): Equipamento {
  const e = cenario.equipamentos.get(chaveDoEquipamento(planta, unidade, nome));
  if (!e) throw new Error(`Equipamento do seed não encontrado: ${planta} / ${unidade} / ${nome}`);
  return e;
}

export function idDe(mapa: Map<string, string>, chave: string, oQue: string): string {
  const id = mapa.get(chave);
  if (!id) throw new Error(`${oQue} do seed não encontrado: ${chave}`);
  return id;
}

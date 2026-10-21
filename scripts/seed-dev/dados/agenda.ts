/**
 * Agenda e frota do seed: feriados (os nacionais de 2026 e do começo de 2027
 * e os municipais das cidades das plantas), dias úteis por planta e as
 * viaturas da equipe, com documentos e reservas avulsas.
 */
export interface FeriadoDoSeed {
  nome: string;
  data: string;
  tipo: 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL';
  recorrente: boolean;
  /** Municipal: as plantas da cidade */
  plantas?: string[];
}

export const FERIADOS: FeriadoDoSeed[] = [
  { nome: 'Confraternização Universal', data: '2026-01-01', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Sexta-feira Santa', data: '2026-04-03', tipo: 'NACIONAL', recorrente: false },
  { nome: 'Tiradentes', data: '2026-04-21', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Dia do Trabalho', data: '2026-05-01', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Independência do Brasil', data: '2026-09-07', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Nossa Senhora Aparecida', data: '2026-10-12', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Finados', data: '2026-11-02', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Proclamação da República', data: '2026-11-15', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Dia Nacional de Zumbi e da Consciência Negra', data: '2026-11-20', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Natal', data: '2026-12-25', tipo: 'NACIONAL', recorrente: true },
  { nome: 'Sexta-feira Santa', data: '2027-03-26', tipo: 'NACIONAL', recorrente: false },
  { nome: 'Aniversário de Goiânia', data: '2026-10-24', tipo: 'MUNICIPAL', recorrente: true, plantas: ['hospital'] },
  { nome: 'Aniversário de Anápolis', data: '2026-07-31', tipo: 'MUNICIPAL', recorrente: true, plantas: ['laticinio'] },
];

export interface DiasUteisDoSeed {
  nome: string;
  descricao: string;
  dias: { segunda: boolean; terca: boolean; quarta: boolean; quinta: boolean; sexta: boolean; sabado: boolean; domingo: boolean };
  /** Sem plantas: a regra geral */
  plantas?: string[];
}

const SEMANA = { segunda: true, terca: true, quarta: true, quinta: true, sexta: true };

export const DIAS_UTEIS: DiasUteisDoSeed[] = [
  { nome: 'Segunda a sexta', descricao: 'Regra geral da equipe de manutenção', dias: { ...SEMANA, sabado: false, domingo: false } },
  {
    nome: 'Segunda a sábado (usina e fazenda)',
    descricao: 'Usina e fazenda aceitam preventiva no sábado: a geração e a irrigação têm janela melhor',
    dias: { ...SEMANA, sabado: true, domingo: false },
    plantas: ['ufv', 'fazenda'],
  },
  { nome: 'Todos os dias (hospital)', descricao: 'O hospital não fecha: a preventiva pode cair no fim de semana', dias: { ...SEMANA, sabado: true, domingo: true }, plantas: ['hospital'] },
];

export interface VeiculoDoSeed {
  chave: string;
  nome: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  tipo: 'caminhonete' | 'utilitario' | 'van' | 'carro';
  combustivel: 'diesel' | 'flex';
  passageiros: number;
  cargaKg: number;
  autonomia: number;
  km: number;
  cor: string;
  valor: number;
  renavam: string;
  /** Documento com vencimento perto de hoje (dias a partir de hoje), para o alerta aparecer */
  documentoVence?: number;
}

export const VEICULOS: VeiculoDoSeed[] = [
  { chave: 'hilux1', nome: 'Hilux 01', placa: 'SBH2C41', marca: 'Toyota', modelo: 'Hilux SRX 2.8 4x4', ano: 2024, tipo: 'caminhonete', combustivel: 'diesel', passageiros: 5, cargaKg: 1000, autonomia: 10.5, km: 48210, cor: 'Branca', valor: 289000, renavam: '01318529746' },
  { chave: 'hilux2', nome: 'Hilux 02', placa: 'SBH7F18', marca: 'Toyota', modelo: 'Hilux SR 2.8 4x4', ano: 2023, tipo: 'caminhonete', combustivel: 'diesel', passageiros: 5, cargaKg: 1000, autonomia: 10.8, km: 81540, cor: 'Prata', valor: 241000, renavam: '01287461350', documentoVence: 12 },
  { chave: 'strada', nome: 'Strada 01', placa: 'RBK9A02', marca: 'Fiat', modelo: 'Strada Freedom 1.3', ano: 2025, tipo: 'utilitario', combustivel: 'flex', passageiros: 2, cargaKg: 650, autonomia: 12.4, km: 21870, cor: 'Branca', valor: 109000, renavam: '01362598174' },
  { chave: 'saveiro', nome: 'Saveiro 01', placa: 'RAZ3D55', marca: 'Volkswagen', modelo: 'Saveiro Robust 1.6', ano: 2022, tipo: 'utilitario', combustivel: 'flex', passageiros: 2, cargaKg: 700, autonomia: 11.6, km: 96320, cor: 'Branca', valor: 82000, renavam: '01247830519' },
  { chave: 'sprinter', nome: 'Van da equipe', placa: 'SBC4J77', marca: 'Mercedes-Benz', modelo: 'Sprinter 416 Van', ano: 2024, tipo: 'van', combustivel: 'diesel', passageiros: 9, cargaKg: 1400, autonomia: 9.2, km: 37450, cor: 'Branca', valor: 365000, renavam: '01329874615' },
];

export interface ReservaAvulsaDoSeed {
  diasAtras: number;
  dias: number;
  veiculo: string;
  tipo: 'viagem' | 'manutencao' | 'manual';
  responsavel: string;
  finalidade: string;
  horaInicio: string;
  horaFim: string;
}

export const RESERVAS_AVULSAS: ReservaAvulsaDoSeed[] = [
  // Só as próximas: o service recusa reserva no passado pelo relógio de verdade
  { diasAtras: -3, dias: 1, veiculo: 'hilux2', tipo: 'manutencao', responsavel: 'felipe', finalidade: 'Troca de pneus e alinhamento', horaInicio: '08:00', horaFim: '12:00' },
  { diasAtras: -6, dias: 1, veiculo: 'strada', tipo: 'viagem', responsavel: 'renata', finalidade: 'Levar o termovisor e o megôhmetro para calibração em laboratório', horaInicio: '09:00', horaFim: '12:00' },
  { diasAtras: -10, dias: 2, veiculo: 'hilux1', tipo: 'viagem', responsavel: 'marcos', finalidade: 'Visita técnica ao cliente novo em Jataí', horaInicio: '07:00', horaFim: '19:00' },
];

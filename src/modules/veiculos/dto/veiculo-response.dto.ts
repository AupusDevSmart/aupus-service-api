import { StatusVeiculo, TipoVeiculo, TipoCombustivel } from '@prisma/client';

export class DocumentacaoResumoDto {
  id: string;
  tipo: string;
  descricao: string;
  dataVencimento: Date;
  ativo: boolean;
  diasParaVencer?: number;
}

export class ReservaResumoDto {
  id: string;
  dataInicio: Date;
  dataFim: Date;
  horaInicio: string;
  horaFim: string;
  responsavel: string;
  finalidade: string;
  status: string;
}

export class VeiculoResponseDto {
  id: string;
  nome: string;
  codigoPatrimonial?: string;
  placa: string;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  anoModelo?: number;
  cor?: string;
  chassi?: string;
  renavam?: string;
  tipo: TipoVeiculo;
  tipoCombustivel: TipoCombustivel;
  capacidadePassageiros: number;
  capacidadeCarga: number;
  autonomiaMedia?: number;
  status: StatusVeiculo;
  localizacaoAtual: string;
  valorAquisicao?: number;
  dataAquisicao?: Date;
  quilometragem: number;
  proximaRevisao?: Date;
  ultimaRevisao?: Date;
  responsavel: string;
  responsavelId?: string;
  observacoes?: string;
  foto?: string;
  ativo: boolean;
  motivoInativacao?: string;
  inativadoPor?: string;
  plantaId?: string;
  proprietarioId?: string;
  criadoEm: Date;
  atualizadoEm: Date;

  // Relacionamentos
  documentacao?: DocumentacaoResumoDto[];
  reservasAtivas?: ReservaResumoDto[];
  proximasReservas?: ReservaResumoDto[];

  // Contadores
  _count?: {
    documentacao: number;
    reservas: number;
  };

  // Campos calculados
  disponivel?: boolean;
  alertasDocumentacao?: number;
  proximaIndisponibilidade?: Date;
}
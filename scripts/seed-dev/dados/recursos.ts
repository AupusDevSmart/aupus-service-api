/**
 * Recursos e maquinários do seed, nas 6 categorias do AupusProject (SN-83/84).
 * Preços de referência de Goiás em 2026, para a conta da instrução e da OS ter
 * ordem de grandeza de verdade.
 */
export interface RecursoDoSeed {
  nome: string;
  categoria: 'MAO_DE_OBRA' | 'MATERIAL' | 'INSTRUMENTO' | 'VEICULO' | 'TERCEIRO' | 'DESPESA_CAMPO';
  unidade: string;
  base_calculo: 'hora' | 'diaria' | 'unidade' | 'km' | 'fechado';
  preco_unitario: number | null;
  funcao?: string;
  descricao?: string;
  horas_por_diaria?: number;
  /** O instrumento próprio: o custo sai da amortização (aquisição, retorno, custos do ano, meta de uso) */
  proprio?: { valor_aquisicao: number; prazo_retorno_meses: number; custos_anuais: number; meta_utilizacao_horas: number };
}

export const RECURSOS: RecursoDoSeed[] = [
  // Mão de obra (o preço é o da hora; a programação sugere uma vaga por pessoa)
  { nome: 'Eletricista de manutenção', categoria: 'MAO_DE_OBRA', unidade: 'h', base_calculo: 'hora', preco_unitario: 62, funcao: 'Execução elétrica (NR-10 básico)' },
  { nome: 'Técnico em eletrotécnica', categoria: 'MAO_DE_OBRA', unidade: 'h', base_calculo: 'hora', preco_unitario: 78, funcao: 'Ensaios, medições e diagnóstico (NR-10 SEP)' },
  { nome: 'Engenheiro eletricista', categoria: 'MAO_DE_OBRA', unidade: 'h', base_calculo: 'hora', preco_unitario: 165, funcao: 'Responsável técnico, laudos e ART' },
  { nome: 'Mecânico de manutenção', categoria: 'MAO_DE_OBRA', unidade: 'h', base_calculo: 'hora', preco_unitario: 64, funcao: 'Mecânica de motores, redutores e mancais' },
  { nome: 'Auxiliar de manutenção', categoria: 'MAO_DE_OBRA', unidade: 'h', base_calculo: 'hora', preco_unitario: 38, funcao: 'Apoio, limpeza e movimentação' },

  // Material (a perda entra na quantidade comprada)
  { nome: 'Fita isolante de autofusão', categoria: 'MATERIAL', unidade: 'rolo', base_calculo: 'unidade', preco_unitario: 46 },
  { nome: 'Terminal de compressão 95 mm²', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 14.8 },
  { nome: 'Óleo mineral isolante', categoria: 'MATERIAL', unidade: 'L', base_calculo: 'unidade', preco_unitario: 21 },
  { nome: 'Sílica gel azul', categoria: 'MATERIAL', unidade: 'kg', base_calculo: 'unidade', preco_unitario: 68 },
  { nome: 'Filtro de ar para inversor', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 135 },
  { nome: 'Graxa para rolamentos', categoria: 'MATERIAL', unidade: 'kg', base_calculo: 'unidade', preco_unitario: 92 },
  { nome: 'Álcool isopropílico', categoria: 'MATERIAL', unidade: 'L', base_calculo: 'unidade', preco_unitario: 34 },
  { nome: 'Detergente neutro biodegradável', categoria: 'MATERIAL', unidade: 'L', base_calculo: 'unidade', preco_unitario: 26 },
  { nome: 'Água desmineralizada', categoria: 'MATERIAL', unidade: 'L', base_calculo: 'unidade', preco_unitario: 0.12 },
  { nome: 'Fusível gPV 15 A 1500 Vcc', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 58 },
  { nome: 'Junta de vedação para bucha', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 185 },
  { nome: 'Kit de frascos para coleta de óleo', categoria: 'MATERIAL', unidade: 'kit', base_calculo: 'unidade', preco_unitario: 95 },
  { nome: 'Motorredutor para torre de pivô', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 3850 },
  { nome: 'Célula capacitiva 25 kVAr 440 V', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 1480 },
  { nome: 'Rolamento 6312 2Z', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 210 },
  { nome: 'Cabo flexível 35 mm² 0,6/1 kV', categoria: 'MATERIAL', unidade: 'm', base_calculo: 'unidade', preco_unitario: 39.5 },
  { nome: 'Disjuntor caixa moldada 125 A', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: 1290 },
  { nome: 'Pasta condutiva para contatos', categoria: 'MATERIAL', unidade: 'bisnaga', base_calculo: 'unidade', preco_unitario: 78 },
  { nome: 'Abraçadeira de nylon (pacote com 100)', categoria: 'MATERIAL', unidade: 'pct', base_calculo: 'unidade', preco_unitario: 24 },
  // Sem preço de propósito: a proposta e a programação mostram "sem preço no cadastro" (SN-86)
  { nome: 'Placa de identificação em aço inox', categoria: 'MATERIAL', unidade: 'un', base_calculo: 'unidade', preco_unitario: null },

  // Instrumentos (diária de 8 h; o termovisor é próprio e amortiza)
  {
    nome: 'Termovisor',
    categoria: 'INSTRUMENTO',
    unidade: 'diária',
    base_calculo: 'diaria',
    preco_unitario: null,
    horas_por_diaria: 8,
    descricao: 'Câmera termográfica 320x240, faixa -20 a 650 °C',
    proprio: { valor_aquisicao: 38000, prazo_retorno_meses: 36, custos_anuais: 2400, meta_utilizacao_horas: 600 },
  },
  { nome: 'Megôhmetro 5 kV', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 160, horas_por_diaria: 8 },
  { nome: 'Microhmímetro 100 A', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 230, horas_por_diaria: 8 },
  { nome: 'Medidor de relação de transformação (TTR)', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 280, horas_por_diaria: 8 },
  { nome: 'Mala de teste de relés', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 480, horas_por_diaria: 8 },
  { nome: 'Analisador de qualidade de energia', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 270, horas_por_diaria: 24 },
  { nome: 'Terrômetro digital', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 95, horas_por_diaria: 8 },
  { nome: 'Multímetro True RMS', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 25, horas_por_diaria: 8 },
  { nome: 'Alicate amperímetro', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 22, horas_por_diaria: 8 },
  { nome: 'Traçador de curva I-V', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 320, horas_por_diaria: 8 },
  { nome: 'Analisador de vibração', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 210, horas_por_diaria: 8 },
  { nome: 'Torquímetro 5 a 60 N·m', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 30, horas_por_diaria: 8 },
  { nome: 'Oscilógrafo para disjuntores', categoria: 'INSTRUMENTO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 350, horas_por_diaria: 8 },

  // Veículo (por km rodado)
  { nome: 'Picape 4x4', categoria: 'VEICULO', unidade: 'km', base_calculo: 'km', preco_unitario: 2.35 },
  { nome: 'Veículo utilitário', categoria: 'VEICULO', unidade: 'km', base_calculo: 'km', preco_unitario: 1.65 },

  // Terceiros (preço fechado)
  { nome: 'Análise cromatográfica e físico-química do óleo', categoria: 'TERCEIRO', unidade: 'amostra', base_calculo: 'fechado', preco_unitario: 720 },
  { nome: 'Emissão de ART', categoria: 'TERCEIRO', unidade: 'ART', base_calculo: 'fechado', preco_unitario: 104 },
  { nome: 'Calibração de instrumento em laboratório', categoria: 'TERCEIRO', unidade: 'un', base_calculo: 'fechado', preco_unitario: 640 },

  // Despesa de campo (por diária)
  { nome: 'Diária de alimentação', categoria: 'DESPESA_CAMPO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 78, horas_por_diaria: 8 },
  { nome: 'Hospedagem', categoria: 'DESPESA_CAMPO', unidade: 'diária', base_calculo: 'diaria', preco_unitario: 230, horas_por_diaria: 24 },
];

export interface MaquinarioDoSeed {
  nome: string;
  tipo: 'proprio' | 'locacao';
  base_calculo: 'diaria' | 'hora' | 'km' | 'fechado';
  preco_unitario: number | null;
  descricao?: string;
  horas_por_diaria?: number;
  proprio?: { valor_aquisicao: number; prazo_retorno_meses: number; custos_anuais: number; meta_utilizacao_horas: number };
}

export const MAQUINARIOS: MaquinarioDoSeed[] = [
  { nome: 'Caminhão munck 12 t', tipo: 'locacao', base_calculo: 'diaria', preco_unitario: 1650, horas_por_diaria: 8, descricao: 'Com operador; içamento de transformadores e cubículos' },
  { nome: 'Caminhão com cesto aéreo', tipo: 'locacao', base_calculo: 'diaria', preco_unitario: 1380, horas_por_diaria: 8, descricao: 'Trabalho em altura em estruturas de subestação' },
  { nome: 'Caminhão-pipa 10 mil litros', tipo: 'locacao', base_calculo: 'diaria', preco_unitario: 1100, horas_por_diaria: 8, descricao: 'Água para a limpeza de módulos' },
  { nome: 'Plataforma elevatória articulada', tipo: 'locacao', base_calculo: 'diaria', preco_unitario: 690, horas_por_diaria: 8 },
  {
    nome: 'Gerador diesel 150 kVA',
    tipo: 'proprio',
    base_calculo: 'diaria',
    preco_unitario: null,
    horas_por_diaria: 10,
    descricao: 'Alimentação provisória durante desligamentos programados',
    proprio: { valor_aquisicao: 185000, prazo_retorno_meses: 120, custos_anuais: 9000, meta_utilizacao_horas: 1200 },
  },
];

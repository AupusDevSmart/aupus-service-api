/**
 * O catálogo de categorias e modelos do dev. As categorias e os modelos que
 * existem ficam (o NexOn e a sincronização usam os mesmos ids), com o texto
 * corrigido; entram as categorias e os modelos que os disjuntores,
 * transformadores e inversores do cenário pedem (decisão do usuário, SN-70).
 */

/**
 * Texto que passou por um terminal em CP850: o UTF-8 de "é" (C3 A9) virou
 * "├®". Cada par conhecido volta ao caractere de origem. A mesma tabela do SQL
 * de produção (`prisma/sql/2026-10-21-texto-cp850-do-catalogo.sql`).
 */
const PARES_CP850: Record<string, string> = {
  // minúsculas: o segundo byte do UTF-8 (A0..BF) lido na tabela do CP850
  '├á': 'à', '├í': 'á', '├ó': 'â', '├ú': 'ã', '├ñ': 'ä', '├º': 'ç', '├¿': 'è', '├®': 'é', '├¬': 'ê', '├¡': 'í',
  '├«': 'î', '├│': 'ó', '├┤': 'ô', '├Á': 'õ', '├║': 'ú', '├╗': 'û', '├╝': 'ü',
  // maiúsculas: o segundo byte em 80..9F
  '├Ç': 'À', '├ü': 'Á', '├é': 'Â', '├â': 'Ã', '├ä': 'Ä', '├ç': 'Ç', '├ë': 'É', '├è': 'Ê', '├ì': 'Í', '├ô': 'Ó',
  '├ö': 'Ô', '├ò': 'Õ', '├Ü': 'Ú',
  // símbolos técnicos (C2 xx e CE A9) e pontuação (E2 80 xx)
  '┬░': '°', '┬║': 'º', '┬¬': 'ª', '┬▓': '²', '┬│': '³', '┬Á': 'µ', '┬À': '·', '┬¢': '½', '╬®': 'Ω',
  'ÔÇô': '–', 'ÔÇö': '—', 'ÔÇ£': '“', 'ÔÇØ': '”', 'ÔÇÿ': '‘', 'ÔÇÖ': '’', 'ÔÇª': '…',
};
const PARES = new RegExp(Object.keys(PARES_CP850).join('|'), 'g');
/** O que sobra de CP850 depois dos pares: desenho de caixa, bloco, ou o "ÔÇ" da pontuação */
const SOBRA_DE_CP850 = /[─-▟]|ÔÇ/;

export function semMojibake(texto: string): string {
  const certo = texto.replace(PARES, (par) => PARES_CP850[par]);
  // Par que não está na tabela: ninguém sabe o caractere de origem, e o seed não adivinha (o SQL também para)
  if (SOBRA_DE_CP850.test(certo)) throw new Error(`Texto do catálogo com CP850 fora dos pares conhecidos: "${texto}"`);
  return certo;
}

/** Categorias que o cenário usa e que ainda não existem (o nome casa com os campos técnicos da tela) */
export const CATEGORIAS_NOVAS = ['Quadro Elétrico Baixa Tensão (QGBT)', 'Aterramento / SPDA'];

/** O nome certo de categoria cujo texto não é só o CP850 (correção de grafia) */
export const NOMES_CORRIGIDOS: Record<string, string> = {
  'Relê Proteção': 'Relé de Proteção',
};

/** Lixo de teste do dev: nome sem sentido, sem equipamento. Sai. */
export const CATEGORIAS_DE_LIXO = ['gtgr'];
export const MODELOS_DE_LIXO = ['fefe', 'ttt'];

export interface ModeloDoSeed {
  codigo: string;
  nome: string;
  fabricante: string;
  categoria: string;
}

/** Modelos novos (os existentes continuam valendo; o cenário usa os dois) */
export const MODELOS_NOVOS: ModeloDoSeed[] = [
  { codigo: 'INV_SG250HX', nome: 'Inversor string SG250HX 250 kW', fabricante: 'Sungrow', categoria: 'Inversor PV' },
  { codigo: 'INV_SUN2000_100', nome: 'Inversor SUN2000-100KTL 100 kW', fabricante: 'Huawei', categoria: 'Inversor PV' },
  { codigo: 'INV_GROWATT_75', nome: 'Inversor MAX 75KTL3 75 kW', fabricante: 'Growatt', categoria: 'Inversor PV' },
  { codigo: 'MOD_TIGER_NEO', nome: 'Bloco de módulos bifaciais 580 Wp', fabricante: 'Jinko Solar', categoria: 'Módulos PV' },
  { codigo: 'TR_ELEV_2500', nome: 'Transformador elevador 2500 kVA 0,8/34,5 kV', fabricante: 'WEG', categoria: 'Transformador de Potência' },
  { codigo: 'TR_OLEO_1000', nome: 'Transformador a óleo 1000 kVA 13,8/0,38 kV', fabricante: 'WEG', categoria: 'Transformador de Potência' },
  { codigo: 'TR_OLEO_1500', nome: 'Transformador a óleo 1500 kVA 34,5/0,38 kV', fabricante: 'Romagnole', categoria: 'Transformador de Potência' },
  { codigo: 'TR_SECO_750', nome: 'Transformador a seco 750 kVA 13,8/0,38 kV', fabricante: 'Siemens', categoria: 'Transformador de Potência' },
  { codigo: 'DJ_MT_VD4', nome: 'Disjuntor a vácuo VD4 17,5 kV 630 A', fabricante: 'ABB', categoria: 'Disjuntor MT' },
  { codigo: 'DJ_MT_EVOLIS', nome: 'Disjuntor a vácuo Evolis 36 kV 630 A', fabricante: 'Schneider Electric', categoria: 'Disjuntor MT' },
  { codigo: 'DJ_BT_NSX250', nome: 'Disjuntor caixa moldada NSX 250 A', fabricante: 'Schneider Electric', categoria: 'Disjuntor BT' },
  { codigo: 'DJ_BT_MTZ2', nome: 'Disjuntor aberto Masterpact MTZ2 2000 A', fabricante: 'Schneider Electric', categoria: 'Disjuntor BT' },
  { codigo: 'DJ_BT_DWB', nome: 'Disjuntor caixa moldada DWB 400 A', fabricante: 'WEG', categoria: 'Disjuntor BT' },
  { codigo: 'RELE_SEL751', nome: 'Relé de proteção SEL-751A', fabricante: 'SEL', categoria: 'Relé de Proteção' },
  { codigo: 'RELE_URP6000', nome: 'Relé de proteção URP 6000', fabricante: 'Pextron', categoria: 'Relé de Proteção' },
  { codigo: 'TC_15KV', nome: 'TC de proteção 15 kV 200-5 A', fabricante: 'Balteau', categoria: 'Transformador de Corrente (TC)' },
  { codigo: 'TC_36KV', nome: 'TC de proteção 36 kV 150-5 A', fabricante: 'Balteau', categoria: 'Transformador de Corrente (TC)' },
  { codigo: 'TP_15KV', nome: 'TP de medição 15 kV 13800/115 V', fabricante: 'Balteau', categoria: 'Transformador de Potencial (TP)' },
  { codigo: 'TP_36KV', nome: 'TP de medição 36 kV 34500/115 V', fabricante: 'Balteau', categoria: 'Transformador de Potencial (TP)' },
  { codigo: 'IF_CFW11', nome: 'Inversor de frequência CFW11 150 cv', fabricante: 'WEG', categoria: 'Inversor Frequência' },
  { codigo: 'IF_ATV630', nome: 'Inversor de frequência ATV630 75 kW', fabricante: 'Schneider Electric', categoria: 'Inversor Frequência' },
  { codigo: 'SS_SSW07', nome: 'Soft-starter SSW07 85 A', fabricante: 'WEG', categoria: 'SoftStarter' },
  { codigo: 'MOT_W22_150', nome: 'Motor W22 IR3 150 cv 4 polos', fabricante: 'WEG', categoria: 'Motor Elétrico' },
  { codigo: 'MOT_W22_75', nome: 'Motor W22 IR3 75 cv 2 polos', fabricante: 'WEG', categoria: 'Motor Elétrico' },
  { codigo: 'BC_250KVAR', nome: 'Banco de capacitores automático 250 kVAr', fabricante: 'WEG', categoria: 'Banco Capacitor' },
  { codigo: 'QGBT_2000', nome: 'QGBT 2000 A forma 3b', fabricante: 'Schneider Electric', categoria: 'Quadro Elétrico Baixa Tensão (QGBT)' },
  { codigo: 'QGBT_800', nome: 'QGBT 800 A forma 2', fabricante: 'Siemens', categoria: 'Quadro Elétrico Baixa Tensão (QGBT)' },
  { codigo: 'SPDA_MALHA', nome: 'Malha de aterramento e SPDA', fabricante: 'Termotécnica', categoria: 'Aterramento / SPDA' },
  { codigo: 'CH_SECC_36', nome: 'Chave seccionadora tripolar 36 kV', fabricante: 'Delmar', categoria: 'Chave' },
  { codigo: 'MED_ION8650', nome: 'Medidor de faturamento ION8650', fabricante: 'Schneider Electric', categoria: 'Power Meter (PM)' },
];

/** O plano template de cada categoria (só UC recebe plano; a cópia nasce do template) */
export interface TarefaDoTemplate {
  nome: string;
  instrucao: string;
  frequencia: 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  criticidade: number;
}

export interface TemplateDoSeed {
  categoria: string;
  nome: string;
  descricao: string;
  tarefas: TarefaDoTemplate[];
}

export const TEMPLATES: TemplateDoSeed[] = [
  {
    categoria: 'Inversor PV',
    nome: 'Plano do inversor fotovoltaico',
    descricao: 'Rotina do fabricante e da operação: inspeção trimestral, limpeza semestral e termografia anual.',
    tarefas: [
      { nome: 'Inspeção do inversor', instrucao: 'INV-01', frequencia: 'TRIMESTRAL', criticidade: 3 },
      { nome: 'Limpeza de filtros e dissipadores', instrucao: 'INV-02', frequencia: 'SEMESTRAL', criticidade: 3 },
      { nome: 'Termografia e reaperto', instrucao: 'INV-03', frequencia: 'ANUAL', criticidade: 4 },
    ],
  },
  {
    categoria: 'Módulos PV',
    nome: 'Plano do bloco de módulos',
    descricao: 'Limpeza trimestral (estação seca pede mais) e inspeção das strings semestral.',
    tarefas: [
      { nome: 'Limpeza dos módulos', instrucao: 'PV-01', frequencia: 'TRIMESTRAL', criticidade: 3 },
      { nome: 'Inspeção das strings (Voc, Isc e isolamento)', instrucao: 'PV-02', frequencia: 'SEMESTRAL', criticidade: 3 },
    ],
  },
  {
    categoria: 'Transformador de Potência',
    nome: 'Plano do transformador de potência',
    descricao: 'Inspeção sensitiva trimestral, óleo e ensaios elétricos anuais.',
    tarefas: [
      { nome: 'Inspeção sensitiva', instrucao: 'TR-01', frequencia: 'TRIMESTRAL', criticidade: 4 },
      { nome: 'Coleta de óleo para análise', instrucao: 'TR-02', frequencia: 'ANUAL', criticidade: 4 },
      { nome: 'Ensaios elétricos', instrucao: 'TR-03', frequencia: 'ANUAL', criticidade: 5 },
    ],
  },
  {
    categoria: 'Disjuntor MT',
    nome: 'Plano do disjuntor de média tensão',
    descricao: 'Inspeção semestral e ensaio anual de contato e tempos.',
    tarefas: [
      { nome: 'Inspeção e limpeza', instrucao: 'DJMT-01', frequencia: 'SEMESTRAL', criticidade: 4 },
      { nome: 'Resistência de contato e tempos de operação', instrucao: 'DJMT-02', frequencia: 'ANUAL', criticidade: 5 },
    ],
  },
  {
    categoria: 'Disjuntor BT',
    nome: 'Plano do disjuntor de baixa tensão',
    descricao: 'Termografia semestral e reaperto anual.',
    tarefas: [
      { nome: 'Termografia', instrucao: 'DJBT-01', frequencia: 'SEMESTRAL', criticidade: 3 },
      { nome: 'Reaperto e teste de disparo', instrucao: 'DJBT-02', frequencia: 'ANUAL', criticidade: 3 },
    ],
  },
  {
    categoria: 'Quadro Elétrico Baixa Tensão (QGBT)',
    nome: 'Plano do QGBT',
    descricao: 'Termografia e inspeção trimestrais: o quadro geral não pode parar sem aviso.',
    tarefas: [{ nome: 'Termografia e inspeção do quadro', instrucao: 'QG-01', frequencia: 'TRIMESTRAL', criticidade: 4 }],
  },
  {
    categoria: 'Relé de Proteção',
    nome: 'Plano do relé de proteção',
    descricao: 'Verificação trimestral de eventos e injeção secundária anual.',
    tarefas: [
      { nome: 'Alarmes e registros de eventos', instrucao: 'RL-02', frequencia: 'TRIMESTRAL', criticidade: 3 },
      { nome: 'Teste de injeção secundária', instrucao: 'RL-01', frequencia: 'ANUAL', criticidade: 5 },
    ],
  },
  {
    categoria: 'Transformador de Corrente (TC)',
    nome: 'Plano do TC',
    descricao: 'Inspeção e ensaio de isolamento anuais.',
    tarefas: [{ nome: 'Inspeção e isolamento', instrucao: 'TC-01', frequencia: 'ANUAL', criticidade: 3 }],
  },
  {
    categoria: 'Transformador de Potencial (TP)',
    nome: 'Plano do TP',
    descricao: 'Inspeção e ensaio de isolamento anuais.',
    tarefas: [{ nome: 'Inspeção e isolamento', instrucao: 'TC-01', frequencia: 'ANUAL', criticidade: 3 }],
  },
  {
    categoria: 'Banco Capacitor',
    nome: 'Plano do banco de capacitores',
    descricao: 'Inspeção semestral das células e do fator de potência.',
    tarefas: [{ nome: 'Inspeção do banco', instrucao: 'BC-01', frequencia: 'SEMESTRAL', criticidade: 3 }],
  },
  {
    categoria: 'Motor Elétrico',
    nome: 'Plano do motor elétrico',
    descricao: 'Lubrificação bimestral, vibração trimestral e isolamento semestral.',
    tarefas: [
      { nome: 'Lubrificação dos mancais', instrucao: 'MOT-02', frequencia: 'BIMESTRAL', criticidade: 3 },
      { nome: 'Vibração e temperatura dos mancais', instrucao: 'MOT-01', frequencia: 'TRIMESTRAL', criticidade: 4 },
      { nome: 'Resistência de isolamento', instrucao: 'MOT-03', frequencia: 'SEMESTRAL', criticidade: 3 },
    ],
  },
  {
    categoria: 'Inversor Frequência',
    nome: 'Plano do inversor de frequência',
    descricao: 'Limpeza e conferência de parâmetros semestrais.',
    tarefas: [{ nome: 'Limpeza e verificação', instrucao: 'IF-01', frequencia: 'SEMESTRAL', criticidade: 3 }],
  },
  {
    categoria: 'SoftStarter',
    nome: 'Plano da soft-starter',
    descricao: 'Limpeza e conferência de parâmetros semestrais.',
    tarefas: [{ nome: 'Limpeza e verificação', instrucao: 'IF-01', frequencia: 'SEMESTRAL', criticidade: 2 }],
  },
  {
    categoria: 'Pivô',
    nome: 'Plano do pivô central',
    descricao: 'Inspeção trimestral fora do período de irrigação intensa.',
    tarefas: [{ nome: 'Inspeção do pivô', instrucao: 'PIVO-01', frequencia: 'TRIMESTRAL', criticidade: 3 }],
  },
  {
    categoria: 'Chave',
    nome: 'Plano da chave seccionadora',
    descricao: 'Inspeção e lubrificação anuais.',
    tarefas: [{ nome: 'Inspeção e lubrificação', instrucao: 'CH-01', frequencia: 'ANUAL', criticidade: 3 }],
  },
  {
    categoria: 'Power Meter (PM)',
    nome: 'Plano do medidor',
    descricao: 'Aferição e comunicação anuais.',
    tarefas: [{ nome: 'Verificação do medidor', instrucao: 'MED-01', frequencia: 'ANUAL', criticidade: 2 }],
  },
  {
    categoria: 'Gateway',
    nome: 'Plano do gateway',
    descricao: 'Comunicação semestral.',
    tarefas: [{ nome: 'Verificação da comunicação', instrucao: 'GW-01', frequencia: 'SEMESTRAL', criticidade: 2 }],
  },
  {
    categoria: 'Aterramento / SPDA',
    nome: 'Plano do aterramento e SPDA',
    descricao: 'Medição e inspeção anuais (NBR 5419).',
    tarefas: [{ nome: 'Medição e inspeção do SPDA', instrucao: 'SPDA-01', frequencia: 'ANUAL', criticidade: 3 }],
  },
];

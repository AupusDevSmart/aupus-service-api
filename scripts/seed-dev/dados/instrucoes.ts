import type { AssuntoDaFoto } from '../foto';

/**
 * As instruções do seed: o procedimento de cada manutenção, com os passos (que
 * viram o checklist da OS), as leituras com faixa e os recursos (que sugerem o
 * planejado da programação). Mesma tabela e mesmas relações da do AupusProject
 * (SN-85).
 */
export type Disciplina = 'administrativo' | 'civil' | 'eletrico' | 'mecanico';

export interface PassoDoSeed {
  descricao: string;
  disciplina?: Disciplina;
  horas?: number;
  /** Padrão: obrigatório */
  opcional?: boolean;
  foto?: AssuntoDaFoto;
  /** Passo de leitura: a faixa aceita e onde o valor costuma cair em campo */
  leitura?: { unidade: string; min: number; max: number; tipico: [number, number] };
}

/** [recurso, quantidade, horas, perda] — horas na mão de obra e no instrumento; perda no material */
export type LinhaDeRecurso = [string, number, number?, number?];
/** [maquinário, quantidade, horas] */
export type LinhaDeMaquinario = [string, number, number];

export interface InstrucaoDoSeed {
  codigo: string;
  nome: string;
  descricao: string;
  frente: string;
  duracao_dias?: number;
  passos: PassoDoSeed[];
  recursos: LinhaDeRecurso[];
  maquinarios?: LinhaDeMaquinario[];
  /** Inativa: existe no cadastro, mas fora do catálogo ativo */
  inativa?: boolean;
}

const NR10 = 'Desenergizar, bloquear e etiquetar (NR-10); conferir ausência de tensão';

export const INSTRUCOES: InstrucaoDoSeed[] = [
  // ---------------------------------------------------------------- inversor e usina
  {
    codigo: 'INV-01',
    nome: 'Inspeção do inversor fotovoltaico',
    descricao: 'Inspeção de rotina do inversor em operação: alarmes, estado do gabinete e grandezas de entrada e saída.',
    frente: 'Usina fotovoltaica',
    passos: [
      { descricao: 'Conferir o histórico de alarmes e eventos no supervisório', disciplina: 'administrativo', horas: 0.25 },
      { descricao: 'Inspecionar gabinete, vedações, prensa-cabos e sinalização', disciplina: 'mecanico', horas: 0.25 },
      { descricao: 'Registrar a temperatura interna do inversor', disciplina: 'eletrico', leitura: { unidade: '°C', min: 10, max: 65, tipico: [32, 52] } },
      { descricao: 'Registrar a tensão CC de entrada do MPPT 1', disciplina: 'eletrico', leitura: { unidade: 'V', min: 600, max: 1300, tipico: [880, 1120] } },
      { descricao: 'Registrar a potência ativa de saída', disciplina: 'eletrico', leitura: { unidade: 'kW', min: 0, max: 250, tipico: [120, 235] } },
      { descricao: 'Fotografar o display com as grandezas do momento', disciplina: 'eletrico', foto: 'leitura' },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1.5], ['Multímetro True RMS', 1, 1.5], ['Alicate amperímetro', 1, 1.5]],
  },
  {
    codigo: 'INV-02',
    nome: 'Limpeza dos filtros e dissipadores do inversor',
    descricao: 'Filtro obstruído eleva a temperatura interna e derrata o inversor nas horas de maior irradiância.',
    frente: 'Usina fotovoltaica',
    passos: [
      { descricao: 'Desligar o inversor pelos seccionadores CA e CC e aguardar 5 minutos', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Remover os filtros e limpar com ar comprimido', disciplina: 'mecanico', horas: 0.5 },
      { descricao: 'Substituir os filtros danificados', disciplina: 'mecanico', opcional: true },
      { descricao: 'Limpar dissipadores e conferir os ventiladores', disciplina: 'mecanico', horas: 0.5 },
      { descricao: 'Religar e registrar a temperatura após 30 minutos', disciplina: 'eletrico', leitura: { unidade: '°C', min: 10, max: 60, tipico: [30, 46] } },
    ],
    recursos: [['Eletricista de manutenção', 1, 2], ['Filtro de ar para inversor', 1, undefined, 0], ['Álcool isopropílico', 0.5]],
  },
  {
    codigo: 'INV-03',
    nome: 'Termografia e reaperto das conexões do inversor',
    descricao: 'Termografia com o inversor acima de 50% da carga e reaperto no torque do fabricante. Conexão frouxa é a causa mais comum de aquecimento.',
    frente: 'Usina fotovoltaica',
    passos: [
      { descricao: 'Termografar as conexões CC e CA com o inversor em carga', disciplina: 'eletrico', horas: 0.5, foto: 'termografia' },
      { descricao: 'Registrar a maior temperatura encontrada nas conexões', disciplina: 'eletrico', leitura: { unidade: '°C', min: 15, max: 90, tipico: [38, 62] } },
      { descricao: NR10, disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Reapertar as conexões CC e CA no torque do fabricante', disciplina: 'eletrico', horas: 1 },
      { descricao: 'Anotar os torques aplicados no relatório', disciplina: 'administrativo' },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 3], ['Eletricista de manutenção', 1, 3], ['Termovisor', 1, 3], ['Torquímetro 5 a 60 N·m', 1, 3]],
  },
  {
    codigo: 'PV-01',
    nome: 'Limpeza dos módulos fotovoltaicos',
    descricao: 'Lavagem com água desmineralizada e escova macia, no início da manhã. Sujidade acumulada chega a custar mais de 5% da geração.',
    frente: 'Usina fotovoltaica',
    duracao_dias: 2,
    passos: [
      { descricao: 'Fotografar o estado de sujidade antes da limpeza', disciplina: 'civil', foto: 'antes' },
      { descricao: 'Lavar os módulos com água desmineralizada e escova macia', disciplina: 'civil', horas: 6 },
      { descricao: 'Inspecionar trincas, delaminação e pontos quentes', disciplina: 'eletrico', horas: 1 },
      { descricao: 'Fotografar o resultado após a limpeza', disciplina: 'civil', foto: 'depois' },
    ],
    recursos: [
      ['Auxiliar de manutenção', 3, 6],
      ['Técnico em eletrotécnica', 1, 6],
      ['Água desmineralizada', 2000, undefined, 0.05],
      ['Detergente neutro biodegradável', 5],
    ],
    maquinarios: [['Caminhão-pipa 10 mil litros', 1, 8]],
  },
  {
    codigo: 'PV-02',
    nome: 'Inspeção das strings e medição de Voc e Isc',
    descricao: 'Medição da string de referência de cada string box e conferência dos fusíveis e do isolamento CC.',
    frente: 'Usina fotovoltaica',
    passos: [
      { descricao: 'Abrir as string boxes e conferir fusíveis e DPS', disciplina: 'eletrico', horas: 1 },
      { descricao: 'Medir a tensão de circuito aberto (Voc) da string de referência', disciplina: 'eletrico', leitura: { unidade: 'V', min: 900, max: 1500, tipico: [1180, 1340] } },
      { descricao: 'Medir a corrente de curto-circuito (Isc) da string de referência', disciplina: 'eletrico', leitura: { unidade: 'A', min: 5, max: 20, tipico: [11, 14.5] } },
      { descricao: 'Medir o isolamento CC da string para a terra', disciplina: 'eletrico', leitura: { unidade: 'MΩ', min: 1, max: 10000, tipico: [40, 900] } },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 4], ['Traçador de curva I-V', 1, 4], ['Megôhmetro 5 kV', 1, 4]],
  },
  {
    codigo: 'GW-01',
    nome: 'Verificação do gateway de comunicação',
    descricao: 'Sem comunicação o supervisório deixa de ver falhas: a perda de geração passa despercebida.',
    frente: 'Usina fotovoltaica',
    passos: [
      { descricao: 'Conferir os LEDs de status e a conexão de rede', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Testar a comunicação Modbus com os inversores', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Conferir o envio dos dados ao supervisório', disciplina: 'administrativo', horas: 0.25 },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1]],
  },

  // ---------------------------------------------------------------- transformadores
  {
    codigo: 'TR-01',
    nome: 'Inspeção sensitiva do transformador',
    descricao: 'Inspeção visual e de temperaturas com o transformador em operação.',
    frente: 'Subestação',
    passos: [
      { descricao: 'Conferir o nível de óleo no indicador', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Registrar a temperatura do óleo (termômetro do topo)', disciplina: 'eletrico', leitura: { unidade: '°C', min: 10, max: 95, tipico: [48, 72] } },
      { descricao: 'Registrar a temperatura do enrolamento', disciplina: 'eletrico', leitura: { unidade: '°C', min: 10, max: 110, tipico: [55, 85] } },
      { descricao: 'Conferir a sílica gel do secador (azul = boa, rosa = saturada)', disciplina: 'eletrico', foto: 'geral' },
      { descricao: 'Procurar vazamentos em buchas, válvulas e radiadores', disciplina: 'mecanico', horas: 0.25 },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1], ['Eletricista de manutenção', 1, 1]],
  },
  {
    codigo: 'TR-02',
    nome: 'Coleta de óleo isolante para análise',
    descricao: 'Amostra para cromatografia de gases dissolvidos e análise físico-química, com cadeia de custódia.',
    frente: 'Subestação',
    passos: [
      { descricao: 'Coletar a amostra pela válvula de amostragem, em frasco limpo e seco', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Registrar a temperatura do óleo na coleta', disciplina: 'eletrico', leitura: { unidade: '°C', min: 10, max: 90, tipico: [45, 68] } },
      { descricao: 'Identificar o frasco e preencher a cadeia de custódia', disciplina: 'administrativo', horas: 0.25 },
      { descricao: 'Enviar a amostra ao laboratório', disciplina: 'administrativo' },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1.5], ['Kit de frascos para coleta de óleo', 1], ['Análise cromatográfica e físico-química do óleo', 1]],
  },
  {
    codigo: 'TR-03',
    nome: 'Ensaios elétricos do transformador',
    descricao: 'Resistência de isolamento e relação de transformação, com desligamento programado junto ao cliente.',
    frente: 'Subestação',
    passos: [
      { descricao: NR10 + '; aterrar o primário e o secundário', disciplina: 'eletrico', horas: 1 },
      { descricao: 'Medir a resistência de isolamento AT–BT', disciplina: 'eletrico', leitura: { unidade: 'MΩ', min: 500, max: 200000, tipico: [4000, 25000] } },
      { descricao: 'Medir a resistência de isolamento AT–massa', disciplina: 'eletrico', leitura: { unidade: 'MΩ', min: 500, max: 200000, tipico: [5000, 30000] } },
      { descricao: 'Registrar o maior desvio da relação de transformação (TTR)', disciplina: 'eletrico', leitura: { unidade: '%', min: -0.5, max: 0.5, tipico: [-0.2, 0.2] } },
      { descricao: 'Fotografar a placa de identificação', disciplina: 'administrativo', foto: 'geral' },
    ],
    recursos: [
      ['Engenheiro eletricista', 1, 4],
      ['Técnico em eletrotécnica', 2, 4],
      ['Megôhmetro 5 kV', 1, 4],
      ['Medidor de relação de transformação (TTR)', 1, 4],
      ['Placa de identificação em aço inox', 1],
    ],
    maquinarios: [['Gerador diesel 150 kVA', 1, 6]],
  },
  {
    codigo: 'TC-01',
    nome: 'Inspeção e ensaio de isolamento de TC e TP',
    descricao: 'Transformadores de instrumento da medição e da proteção.',
    frente: 'Proteção e medição',
    passos: [
      { descricao: 'Inspecionar o corpo isolante e as conexões secundárias', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Medir a resistência de isolamento primário–terra', disciplina: 'eletrico', leitura: { unidade: 'MΩ', min: 1000, max: 100000, tipico: [8000, 40000] } },
      { descricao: 'Conferir o aterramento do secundário', disciplina: 'eletrico' },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 2], ['Megôhmetro 5 kV', 1, 2]],
  },

  // ---------------------------------------------------------------- disjuntores e quadros
  {
    codigo: 'DJMT-01',
    nome: 'Inspeção e limpeza do disjuntor de média tensão',
    descricao: 'Com a célula desenergizada e o disjuntor extraído.',
    frente: 'Subestação',
    passos: [
      { descricao: 'Extrair o disjuntor com a célula desenergizada', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Limpar polos e contatos com álcool isopropílico', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Registrar o contador de operações', disciplina: 'eletrico', leitura: { unidade: 'operações', min: 0, max: 30000, tipico: [300, 4200] } },
      { descricao: 'Inspecionar e lubrificar o mecanismo de molas', disciplina: 'mecanico', horas: 0.5 },
      { descricao: 'Testar abertura e fechamento, manual e elétrico', disciplina: 'eletrico', horas: 0.25 },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 2], ['Eletricista de manutenção', 1, 2], ['Álcool isopropílico', 0.5], ['Pasta condutiva para contatos', 1]],
  },
  {
    codigo: 'DJMT-02',
    nome: 'Resistência de contato e tempos de operação do disjuntor MT',
    descricao: 'Ensaio anual: contato degradado aquece; tempo fora da faixa compromete a seletividade.',
    frente: 'Subestação',
    passos: [
      { descricao: 'Medir a resistência de contato do polo A', disciplina: 'eletrico', leitura: { unidade: 'µΩ', min: 10, max: 80, tipico: [28, 52] } },
      { descricao: 'Medir a resistência de contato do polo B', disciplina: 'eletrico', leitura: { unidade: 'µΩ', min: 10, max: 80, tipico: [28, 52] } },
      { descricao: 'Medir a resistência de contato do polo C', disciplina: 'eletrico', leitura: { unidade: 'µΩ', min: 10, max: 80, tipico: [28, 52] } },
      { descricao: 'Medir o tempo de abertura', disciplina: 'eletrico', leitura: { unidade: 'ms', min: 20, max: 60, tipico: [32, 45] } },
      { descricao: 'Medir o tempo de fechamento', disciplina: 'eletrico', leitura: { unidade: 'ms', min: 30, max: 80, tipico: [48, 66] } },
    ],
    recursos: [['Engenheiro eletricista', 1, 3], ['Técnico em eletrotécnica', 1, 3], ['Microhmímetro 100 A', 1, 3], ['Oscilógrafo para disjuntores', 1, 3]],
  },
  {
    codigo: 'DJBT-01',
    nome: 'Termografia do disjuntor de baixa tensão',
    descricao: 'Com o circuito acima de 40% da carga nominal.',
    frente: 'Baixa tensão',
    passos: [
      { descricao: 'Termografar terminais e barramentos com o circuito em carga', disciplina: 'eletrico', horas: 0.5, foto: 'termografia' },
      { descricao: 'Registrar a maior temperatura encontrada', disciplina: 'eletrico', leitura: { unidade: '°C', min: 15, max: 80, tipico: [34, 58] } },
      { descricao: 'Registrar a corrente da fase mais carregada', disciplina: 'eletrico', leitura: { unidade: 'A', min: 0, max: 4000, tipico: [80, 900] } },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1], ['Termovisor', 1, 1], ['Alicate amperímetro', 1, 1]],
  },
  {
    codigo: 'DJBT-02',
    nome: 'Reaperto e teste de disparo do disjuntor de baixa tensão',
    descricao: 'Reaperto no torque, teste do disparo e conferência dos ajustes com o estudo de seletividade.',
    frente: 'Baixa tensão',
    passos: [
      { descricao: NR10, disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Reapertar os terminais no torque do fabricante', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Testar o disparo pelo botão de teste', disciplina: 'eletrico' },
      { descricao: 'Conferir os ajustes Ir, Isd e Ii com o estudo de seletividade', disciplina: 'administrativo', horas: 0.25 },
    ],
    recursos: [['Eletricista de manutenção', 1, 1.5], ['Torquímetro 5 a 60 N·m', 1, 1.5]],
  },
  {
    codigo: 'QG-01',
    nome: 'Termografia e inspeção do QGBT',
    descricao: 'Quadro geral de baixa tensão em carga: barramentos, disjuntores e conexões.',
    frente: 'Baixa tensão',
    passos: [
      { descricao: 'Termografar barramentos e disjuntores com o quadro em carga', disciplina: 'eletrico', horas: 1, foto: 'termografia' },
      { descricao: 'Registrar a maior temperatura encontrada', disciplina: 'eletrico', leitura: { unidade: '°C', min: 15, max: 80, tipico: [36, 61] } },
      { descricao: 'Registrar a corrente da fase mais carregada do barramento', disciplina: 'eletrico', leitura: { unidade: 'A', min: 0, max: 5000, tipico: [400, 2600] } },
      { descricao: 'Conferir identificação dos circuitos e diagrama na porta', disciplina: 'administrativo' },
      { descricao: 'Limpar o quadro e conferir as vedações', disciplina: 'mecanico', horas: 0.5 },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 2], ['Termovisor', 1, 2], ['Alicate amperímetro', 1, 2], ['Abraçadeira de nylon (pacote com 100)', 1]],
  },

  // ---------------------------------------------------------------- proteção e medição
  {
    codigo: 'RL-01',
    nome: 'Teste de injeção secundária do relé de proteção',
    descricao: 'Conferência dos ajustes e da atuação real das funções de proteção.',
    frente: 'Proteção e medição',
    passos: [
      { descricao: 'Conferir os ajustes gravados com o estudo de proteção vigente', disciplina: 'administrativo', horas: 0.5 },
      { descricao: 'Injetar corrente e registrar o tempo de atuação da função 51', disciplina: 'eletrico', leitura: { unidade: 's', min: 0.1, max: 1.5, tipico: [0.32, 0.58] } },
      { descricao: 'Testar a função 50N (neutro instantâneo)', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Testar o disparo real do disjuntor pelo relé', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Exportar e arquivar os registros de eventos', disciplina: 'administrativo' },
    ],
    recursos: [['Engenheiro eletricista', 1, 4], ['Mala de teste de relés', 1, 4]],
  },
  {
    codigo: 'RL-02',
    nome: 'Verificação de alarmes e registros do relé',
    descricao: 'Rotina trimestral: eventos, relógio e alimentação auxiliar.',
    frente: 'Proteção e medição',
    passos: [
      { descricao: 'Ler os registros de eventos e as oscilografias', disciplina: 'administrativo', horas: 0.5 },
      { descricao: 'Conferir a sincronização do relógio do relé', disciplina: 'eletrico' },
      { descricao: 'Registrar a tensão da alimentação auxiliar em 125 Vcc', disciplina: 'eletrico', leitura: { unidade: 'V', min: 110, max: 140, tipico: [124, 132] } },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1], ['Multímetro True RMS', 1, 1]],
  },
  {
    codigo: 'MED-01',
    nome: 'Verificação do medidor e da comunicação',
    descricao: 'Comparação das grandezas com o analisador de referência e teste da comunicação com o supervisório.',
    frente: 'Proteção e medição',
    passos: [
      { descricao: 'Comparar as grandezas do medidor com o analisador de referência', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Registrar o erro percentual da energia ativa', disciplina: 'eletrico', leitura: { unidade: '%', min: -1, max: 1, tipico: [-0.3, 0.3] } },
      { descricao: 'Conferir a comunicação com o supervisório', disciplina: 'administrativo' },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1.5], ['Analisador de qualidade de energia', 1, 1.5]],
  },
  {
    codigo: 'BC-01',
    nome: 'Inspeção do banco de capacitores',
    descricao: 'Células, fusíveis e contatores; célula estufada é risco de explosão.',
    frente: 'Baixa tensão',
    passos: [
      { descricao: 'Inspecionar as células (estufamento e vazamento)', disciplina: 'eletrico', horas: 0.5, foto: 'geral' },
      { descricao: 'Registrar a corrente por fase do estágio 1', disciplina: 'eletrico', leitura: { unidade: 'A', min: 0, max: 500, tipico: [60, 140] } },
      { descricao: 'Conferir fusíveis, contatores e resistores de descarga', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Registrar o fator de potência da instalação', disciplina: 'eletrico', leitura: { unidade: 'FP', min: 0.8, max: 1, tipico: [0.92, 0.98] } },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 2], ['Alicate amperímetro', 1, 2], ['Analisador de qualidade de energia', 1, 2]],
  },
  {
    codigo: 'CH-01',
    nome: 'Inspeção e lubrificação de chave seccionadora',
    descricao: 'Contatos, isoladores e articulações da chave.',
    frente: 'Subestação',
    passos: [
      { descricao: 'Inspecionar contatos e isoladores', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Lubrificar as articulações', disciplina: 'mecanico', horas: 0.5 },
      { descricao: 'Operar a chave e conferir o alinhamento dos contatos', disciplina: 'eletrico', horas: 0.25 },
    ],
    recursos: [['Eletricista de manutenção', 2, 1.5], ['Pasta condutiva para contatos', 1]],
    maquinarios: [['Caminhão com cesto aéreo', 1, 3]],
  },
  {
    codigo: 'SPDA-01',
    nome: 'Medição de aterramento e inspeção do SPDA',
    descricao: 'Inspeção conforme a NBR 5419, com medição da malha e da continuidade das descidas.',
    frente: 'Aterramento e SPDA',
    passos: [
      { descricao: 'Inspecionar captores, descidas e conexões', disciplina: 'civil', horas: 1.5 },
      { descricao: 'Medir a resistência de aterramento (queda de potencial)', disciplina: 'eletrico', leitura: { unidade: 'Ω', min: 0, max: 10, tipico: [1.8, 6.5] } },
      { descricao: 'Medir a continuidade da descida mais distante', disciplina: 'eletrico', leitura: { unidade: 'Ω', min: 0, max: 1, tipico: [0.05, 0.4] } },
      { descricao: 'Fotografar as caixas de inspeção', disciplina: 'civil', foto: 'geral' },
      { descricao: 'Emitir o relatório de inspeção', disciplina: 'administrativo', horas: 1 },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 4], ['Terrômetro digital', 1, 4]],
  },

  // ---------------------------------------------------------------- motores e irrigação
  {
    codigo: 'MOT-01',
    nome: 'Análise de vibração e temperatura dos mancais',
    descricao: 'Preditiva: tendência da vibração (ISO 10816) e da temperatura dos mancais.',
    frente: 'Motores e acionamentos',
    passos: [
      { descricao: 'Medir a vibração no mancal do lado acoplado', disciplina: 'mecanico', leitura: { unidade: 'mm/s', min: 0, max: 7.1, tipico: [1.1, 3.4] } },
      { descricao: 'Medir a vibração no mancal do lado oposto', disciplina: 'mecanico', leitura: { unidade: 'mm/s', min: 0, max: 7.1, tipico: [0.9, 2.9] } },
      { descricao: 'Registrar a temperatura dos mancais', disciplina: 'mecanico', leitura: { unidade: '°C', min: 15, max: 85, tipico: [42, 66] } },
      { descricao: 'Registrar a corrente do motor em carga', disciplina: 'eletrico', leitura: { unidade: 'A', min: 0, max: 400, tipico: [90, 210] } },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1.5], ['Analisador de vibração', 1, 1.5], ['Alicate amperímetro', 1, 1.5]],
  },
  {
    codigo: 'MOT-02',
    nome: 'Lubrificação dos mancais do motor',
    descricao: 'Graxa na quantidade e no intervalo da placa do motor; excesso também aquece.',
    frente: 'Motores e acionamentos',
    passos: [
      { descricao: 'Limpar as graxeiras e a saída de graxa velha', disciplina: 'mecanico', horas: 0.25 },
      { descricao: 'Registrar a quantidade de graxa aplicada', disciplina: 'mecanico', leitura: { unidade: 'g', min: 5, max: 80, tipico: [20, 45] } },
      { descricao: 'Registrar a temperatura do mancal após 30 minutos', disciplina: 'mecanico', leitura: { unidade: '°C', min: 15, max: 85, tipico: [40, 62] } },
    ],
    recursos: [['Mecânico de manutenção', 1, 1], ['Graxa para rolamentos', 0.1, undefined, 0.1]],
  },
  {
    codigo: 'MOT-03',
    nome: 'Resistência de isolamento do motor',
    descricao: 'Isolamento a 500 V por 1 minuto e índice de polarização.',
    frente: 'Motores e acionamentos',
    passos: [
      { descricao: NR10, disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Medir o isolamento do enrolamento (500 V, 1 minuto)', disciplina: 'eletrico', leitura: { unidade: 'MΩ', min: 100, max: 50000, tipico: [800, 6000] } },
      { descricao: 'Registrar o índice de polarização', disciplina: 'eletrico', leitura: { unidade: 'IP', min: 1.5, max: 10, tipico: [2.1, 4.2] } },
    ],
    recursos: [['Eletricista de manutenção', 1, 1.5], ['Megôhmetro 5 kV', 1, 1.5]],
  },
  {
    codigo: 'IF-01',
    nome: 'Limpeza e verificação do inversor de frequência',
    descricao: 'Dissipador, ventiladores e parâmetros de proteção do acionamento.',
    frente: 'Motores e acionamentos',
    passos: [
      { descricao: 'Limpar dissipador e ventiladores', disciplina: 'mecanico', horas: 0.5 },
      { descricao: 'Conferir os parâmetros de proteção gravados', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Registrar a temperatura do dissipador em carga', disciplina: 'eletrico', leitura: { unidade: '°C', min: 15, max: 75, tipico: [38, 58] } },
    ],
    recursos: [['Eletricista de manutenção', 1, 1], ['Álcool isopropílico', 0.25]],
  },
  {
    codigo: 'PIVO-01',
    nome: 'Inspeção do pivô central',
    descricao: 'Painel central, motorredutores, caixas de junção e segurança das torres.',
    frente: 'Irrigação',
    passos: [
      { descricao: 'Conferir o painel central: contatores, relés e sinaleiros', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Inspecionar motorredutores e caixas de junção das torres', disciplina: 'mecanico', horas: 1.5 },
      { descricao: 'Conferir o alinhamento das torres e o sistema de segurança', disciplina: 'mecanico', horas: 0.5 },
      { descricao: 'Registrar a tensão no painel da última torre', disciplina: 'eletrico', leitura: { unidade: 'V', min: 340, max: 420, tipico: [368, 392] } },
    ],
    recursos: [['Eletricista de manutenção', 1, 3], ['Mecânico de manutenção', 1, 3], ['Graxa para rolamentos', 0.2, undefined, 0.1]],
  },

  // ---------------------------------------------------------------- corretivas (as anomalias usam)
  {
    codigo: 'COR-01',
    nome: 'Substituição de fusível de string',
    descricao: 'Troca do fusível gPV e conferência da corrente da string.',
    frente: 'Usina fotovoltaica',
    passos: [
      { descricao: 'Desenergizar a string box e conferir ausência de tensão', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Substituir o fusível queimado', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Registrar a corrente da string após a troca', disciplina: 'eletrico', leitura: { unidade: 'A', min: 5, max: 20, tipico: [11, 14] } },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 1], ['Fusível gPV 15 A 1500 Vcc', 2]],
  },
  {
    codigo: 'COR-02',
    nome: 'Diagnóstico e reparo de falha do inversor',
    descricao: 'Do código de falha ao componente substituído, com o inversor acompanhado depois do religamento.',
    frente: 'Usina fotovoltaica',
    passos: [
      { descricao: 'Registrar o código de falha exibido', disciplina: 'administrativo' },
      { descricao: 'Medir o isolamento CC das strings do inversor', disciplina: 'eletrico', leitura: { unidade: 'MΩ', min: 1, max: 10000, tipico: [30, 600] } },
      { descricao: 'Substituir o componente com falha', disciplina: 'eletrico', horas: 2 },
      { descricao: 'Fotografar o componente retirado', disciplina: 'eletrico', foto: 'defeito' },
      { descricao: 'Religar e acompanhar a geração por 30 minutos', disciplina: 'eletrico', horas: 0.5 },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 3], ['Engenheiro eletricista', 1, 1], ['Megôhmetro 5 kV', 1, 3]],
  },
  {
    codigo: 'COR-03',
    nome: 'Tratamento de ponto quente em conexão',
    descricao: 'Limpeza ou troca do terminal, reaperto e termografia de conferência.',
    frente: 'Baixa tensão',
    passos: [
      { descricao: NR10, disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Limpar o contato e substituir o terminal danificado', disciplina: 'eletrico', horas: 1 },
      { descricao: 'Reapertar no torque do fabricante', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Termografar depois de energizar', disciplina: 'eletrico', foto: 'termografia' },
      { descricao: 'Registrar a temperatura após o reparo', disciplina: 'eletrico', leitura: { unidade: '°C', min: 15, max: 70, tipico: [32, 48] } },
    ],
    recursos: [['Eletricista de manutenção', 1, 2], ['Terminal de compressão 95 mm²', 2, undefined, 0], ['Termovisor', 1, 1], ['Fita isolante de autofusão', 1]],
  },
  {
    codigo: 'COR-04',
    nome: 'Reparo de vazamento de óleo do transformador',
    descricao: 'Troca da vedação e reposição do óleo, com conferência no dia seguinte.',
    frente: 'Subestação',
    duracao_dias: 2,
    passos: [
      { descricao: 'Localizar o ponto do vazamento', disciplina: 'mecanico', horas: 0.5, foto: 'defeito' },
      { descricao: NR10, disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Substituir a junta ou a vedação', disciplina: 'mecanico', horas: 3 },
      { descricao: 'Registrar o volume de óleo reposto', disciplina: 'mecanico', leitura: { unidade: 'L', min: 0, max: 80, tipico: [8, 30] } },
      { descricao: 'Conferir a vedação após 24 horas', disciplina: 'mecanico', horas: 0.25 },
    ],
    recursos: [['Técnico em eletrotécnica', 2, 4], ['Óleo mineral isolante', 20, undefined, 0.1], ['Junta de vedação para bucha', 2]],
    maquinarios: [['Caminhão munck 12 t', 1, 4]],
  },
  {
    codigo: 'COR-05',
    nome: 'Troca da sílica gel do secador',
    descricao: 'Sílica saturada deixa a umidade entrar no óleo.',
    frente: 'Subestação',
    passos: [
      { descricao: 'Retirar o copo do secador e descartar a sílica saturada', disciplina: 'mecanico', horas: 0.25 },
      { descricao: 'Encher com sílica nova e completar o selo de óleo', disciplina: 'mecanico', horas: 0.25 },
      { descricao: 'Fotografar o secador remontado', disciplina: 'mecanico', foto: 'depois' },
    ],
    recursos: [['Eletricista de manutenção', 1, 1], ['Sílica gel azul', 2]],
  },
  {
    codigo: 'COR-06',
    nome: 'Substituição de motorredutor do pivô',
    descricao: 'Troca do motorredutor da torre parada e teste de deslocamento.',
    frente: 'Irrigação',
    passos: [
      { descricao: 'Bloquear o painel do pivô e a alimentação da torre', disciplina: 'eletrico', horas: 0.25 },
      { descricao: 'Substituir o motorredutor', disciplina: 'mecanico', horas: 3 },
      { descricao: 'Registrar a corrente do motor da torre em movimento', disciplina: 'eletrico', leitura: { unidade: 'A', min: 0.5, max: 6, tipico: [1.8, 3.2] } },
    ],
    recursos: [['Mecânico de manutenção', 1, 4], ['Eletricista de manutenção', 1, 2], ['Motorredutor para torre de pivô', 1], ['Graxa para rolamentos', 0.2]],
  },
  {
    codigo: 'COR-07',
    nome: 'Substituição de célula do banco de capacitores',
    descricao: 'Troca da célula estufada e conferência da corrente do estágio.',
    frente: 'Baixa tensão',
    passos: [
      { descricao: NR10 + '; aguardar a descarga das células (5 minutos)', disciplina: 'eletrico', horas: 0.5 },
      { descricao: 'Substituir a célula danificada', disciplina: 'eletrico', horas: 1, foto: 'defeito' },
      { descricao: 'Registrar a corrente do estágio após a troca', disciplina: 'eletrico', leitura: { unidade: 'A', min: 0, max: 500, tipico: [60, 140] } },
    ],
    recursos: [['Técnico em eletrotécnica', 1, 2], ['Célula capacitiva 25 kVAr 440 V', 1]],
  },
  {
    codigo: 'COR-08',
    nome: 'Troca de rolamento do motor',
    descricao: 'Substituição dos rolamentos com o motor fora do acoplamento.',
    frente: 'Motores e acionamentos',
    passos: [
      { descricao: NR10 + '; desacoplar o motor', disciplina: 'mecanico', horas: 1 },
      { descricao: 'Substituir os rolamentos dos dois mancais', disciplina: 'mecanico', horas: 3 },
      { descricao: 'Registrar a vibração após a montagem', disciplina: 'mecanico', leitura: { unidade: 'mm/s', min: 0, max: 7.1, tipico: [0.8, 2.2] } },
    ],
    recursos: [['Mecânico de manutenção', 2, 5], ['Rolamento 6312 2Z', 2], ['Graxa para rolamentos', 0.3], ['Analisador de vibração', 1, 1]],
  },

  // ---------------------------------------------------------------- serviços (as solicitações usam)
  {
    codigo: 'SRV-01',
    nome: 'Laudo de SPDA com ART',
    descricao: 'Inspeção completa do SPDA e do aterramento, com laudo técnico assinado e ART.',
    frente: 'Serviços',
    duracao_dias: 3,
    passos: [
      { descricao: 'Levantar o projeto e os laudos anteriores', disciplina: 'administrativo', horas: 1 },
      { descricao: 'Inspecionar o sistema de captação e as descidas', disciplina: 'civil', horas: 3, foto: 'geral' },
      { descricao: 'Medir a resistência de aterramento', disciplina: 'eletrico', leitura: { unidade: 'Ω', min: 0, max: 10, tipico: [2, 7] } },
      { descricao: 'Elaborar o laudo e emitir a ART', disciplina: 'administrativo', horas: 4 },
    ],
    recursos: [['Engenheiro eletricista', 1, 8], ['Técnico em eletrotécnica', 1, 6], ['Terrômetro digital', 1, 6], ['Emissão de ART', 1]],
  },
  {
    codigo: 'SRV-02',
    nome: 'Termografia completa das instalações com relatório',
    descricao: 'Varredura termográfica de quadros, transformadores e conexões, com relatório por ponto e prioridade.',
    frente: 'Serviços',
    duracao_dias: 2,
    passos: [
      { descricao: 'Termografar todos os quadros e conexões em carga', disciplina: 'eletrico', horas: 6, foto: 'termografia' },
      { descricao: 'Registrar a maior temperatura encontrada', disciplina: 'eletrico', leitura: { unidade: '°C', min: 15, max: 120, tipico: [45, 88] } },
      { descricao: 'Elaborar o relatório com a prioridade de cada ponto', disciplina: 'administrativo', horas: 4 },
    ],
    recursos: [['Engenheiro eletricista', 1, 10], ['Termovisor', 1, 6], ['Emissão de ART', 1]],
  },
  {
    codigo: 'SRV-03',
    nome: 'Instalação de circuito para nova carga',
    descricao: 'Circuito dedicado do QGBT até a carga, com disjuntor, cabos e identificação.',
    frente: 'Serviços',
    duracao_dias: 2,
    passos: [
      { descricao: 'Conferir a capacidade do barramento e o estudo de carga', disciplina: 'administrativo', horas: 1 },
      { descricao: 'Lançar os cabos e montar o disjuntor no QGBT', disciplina: 'eletrico', horas: 8 },
      { descricao: 'Medir o isolamento do circuito novo', disciplina: 'eletrico', leitura: { unidade: 'MΩ', min: 100, max: 100000, tipico: [2000, 20000] } },
      { descricao: 'Energizar e registrar a corrente da carga', disciplina: 'eletrico', leitura: { unidade: 'A', min: 0, max: 200, tipico: [40, 95] } },
      { descricao: 'Fotografar o quadro montado e identificado', disciplina: 'eletrico', foto: 'depois' },
    ],
    recursos: [
      ['Eletricista de manutenção', 2, 8],
      ['Engenheiro eletricista', 1, 2],
      ['Cabo flexível 35 mm² 0,6/1 kV', 120, undefined, 0.05],
      ['Disjuntor caixa moldada 125 A', 1],
      ['Terminal de compressão 95 mm²', 6],
      ['Megôhmetro 5 kV', 1, 2],
    ],
  },
  {
    codigo: 'SRV-04',
    nome: 'Treinamento de reciclagem NR-10',
    descricao: 'Reciclagem de 8 horas para a equipe de manutenção do cliente, com certificado.',
    frente: 'Serviços',
    passos: [
      { descricao: 'Ministrar o conteúdo e a parte prática', disciplina: 'administrativo', horas: 8 },
      { descricao: 'Aplicar a avaliação e emitir os certificados', disciplina: 'administrativo', horas: 1 },
    ],
    recursos: [['Engenheiro eletricista', 1, 9], ['Diária de alimentação', 1, 9]],
  },
  {
    codigo: 'SRV-05',
    nome: 'Análise de qualidade de energia (7 dias)',
    descricao: 'Medição contínua de tensão, harmônicos e fator de potência por uma semana, com relatório.',
    frente: 'Serviços',
    duracao_dias: 8,
    passos: [
      { descricao: 'Instalar o analisador no barramento geral', disciplina: 'eletrico', horas: 1 },
      { descricao: 'Retirar o analisador após 7 dias e baixar os dados', disciplina: 'eletrico', horas: 1 },
      { descricao: 'Registrar a distorção harmônica total de tensão (THD)', disciplina: 'eletrico', leitura: { unidade: '%', min: 0, max: 10, tipico: [2.1, 6.4] } },
      { descricao: 'Elaborar o relatório com as recomendações', disciplina: 'administrativo', horas: 4 },
    ],
    recursos: [['Engenheiro eletricista', 1, 6], ['Técnico em eletrotécnica', 1, 2], ['Analisador de qualidade de energia', 1, 168]],
  },

  // Fora do catálogo ativo: aparece no cadastro com o filtro de inativas
  {
    codigo: 'INV-00',
    nome: 'Inspeção do inversor (versão de 2024)',
    descricao: 'Substituída pela INV-01, que mede as grandezas do MPPT.',
    frente: 'Usina fotovoltaica',
    inativa: true,
    passos: [{ descricao: 'Conferir os alarmes do inversor', disciplina: 'eletrico', horas: 0.5 }],
    recursos: [['Eletricista de manutenção', 1, 0.5]],
  },
];

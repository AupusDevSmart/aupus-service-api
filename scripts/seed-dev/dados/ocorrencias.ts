/**
 * O que acontece fora do plano ao longo do ano: anomalias (viram corretiva)
 * e solicitações dos clientes (viram serviço com proposta). Cada uma diz
 * quando aconteceu (dias atrás, hora de Brasília) e o desfecho; as recentes
 * ficam em aberto para as telas terem o que mostrar em cada status.
 */
export interface Falha {
  sintoma: string;
  causa: string;
  acao: string;
}

export interface AnomaliaDoSeed {
  diasAtras: number;
  hora: string;
  planta: string;
  unidade: string;
  equipamento: string;
  descricao: string;
  condicao: 'PARADO' | 'FUNCIONANDO' | 'RISCO_ACIDENTE';
  origem: 'SCADA' | 'OPERADOR' | 'FALHA';
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  /** Quem registrou: técnico, cliente ou o planejador (SCADA) */
  por: string;
  instrucoes: string[];
  /**
   * corretiva: programa, executa e finaliza; troca: idem, e o equipamento sai
   * da posição para um novo; aberta: fica registrada; programada: programação
   * pendente de aprovação; em_execucao/pausada: OS aberta agora; executada: o
   * auditor ainda não viu; auditada: falta finalizar; cancelada: a
   * programação é cancelada e a anomalia volta a registrada.
   */
  desfecho: 'corretiva' | 'troca' | 'aberta' | 'programada' | 'em_execucao' | 'pausada' | 'executada' | 'auditada' | 'cancelada';
  /** O equipamento parou (entra no MTBF, MTTR e na disponibilidade) e por quantas horas */
  parouHoras?: number;
  falha?: Falha;
  resultado?: string;
}

export const ANOMALIAS: AnomaliaDoSeed[] = [
  {
    diasAtras: 340, hora: '06:52', planta: 'ufv', unidade: 'Eletrocentro 1', equipamento: 'Inversor 07',
    descricao: 'Inversor 07 desligado com falha de isolamento CC (código 039); geração do inversor zerada desde 06:40.',
    condicao: 'PARADO', origem: 'SCADA', prioridade: 'ALTA', por: 'carlos', instrucoes: ['COR-02'], desfecho: 'corretiva', parouHoras: 31,
    falha: { sintoma: 'Inversor desligado por falha de isolamento CC', causa: 'Isolamento do cabo da string 7 danificado por roedor', acao: 'Trecho do cabo substituído e conectores MC4 refeitos' },
    resultado: 'Cabo da string 7 substituído; isolamento medido em 420 MΩ; inversor religado e acompanhado por 30 minutos.',
  },
  {
    diasAtras: 318, hora: '14:10', planta: 'laticinio', unidade: 'Subestação de entrada 13,8 kV', equipamento: 'Relé de proteção geral',
    descricao: 'Relé de proteção geral com alarme de falha de comunicação com o supervisório.',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'MEDIA', por: 'renata', instrucoes: ['RL-02'], desfecho: 'corretiva',
    falha: { sintoma: 'Relé sem comunicação com o supervisório', causa: 'Conversor serial RS485 do relé queimado', acao: 'Conversor substituído e relógio do relé sincronizado' },
    resultado: 'Conversor serial do relé substituído; comunicação restabelecida e relógio sincronizado.',
  },
  {
    diasAtras: 305, hora: '10:25', planta: 'laticinio', unidade: 'Produção e refrigeração', equipamento: 'Compressor de amônia 02',
    descricao: 'Ruído anormal e vibração alta no mancal do lado acoplado do compressor 2 (6,8 mm/s na ronda).',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'lucas', instrucoes: ['COR-08'], desfecho: 'corretiva', parouHoras: 9,
    falha: { sintoma: 'Vibração de 6,8 mm/s e ruído no mancal LA', causa: 'Rolamento do lado acoplado com pista marcada (fim de vida)', acao: 'Rolamentos dos dois mancais substituídos e alinhamento refeito' },
    resultado: 'Rolamentos substituídos; vibração após a montagem em 1,4 mm/s.',
  },
  {
    diasAtras: 280, hora: '09:15', planta: 'hospital', unidade: 'Quadros elétricos', equipamento: 'QGBT normal',
    descricao: 'Ponto quente de 92 °C no terminal do alimentador do ar-condicionado central, achado na termografia.',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'bruno', instrucoes: ['COR-03'], desfecho: 'corretiva',
    falha: { sintoma: 'Ponto quente de 92 °C no terminal do alimentador', causa: 'Terminal oxidado com aperto abaixo do torque', acao: 'Terminal substituído e reapertado no torque' },
    resultado: 'Terminal oxidado substituído e reapertado; termografia após o reparo em 41 °C.',
  },
  {
    diasAtras: 262, hora: '05:40', planta: 'fazenda', unidade: 'Irrigação', equipamento: 'Pivô 04',
    descricao: 'Pivô 4 parado na torre 6: motorredutor travado e disjuntor da torre desarmando.',
    condicao: 'PARADO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'marcelo', instrucoes: ['COR-06'], desfecho: 'corretiva', parouHoras: 52,
    falha: { sintoma: 'Torre 6 parada e disjuntor da torre desarmando', causa: 'Motorredutor da torre 6 travado (engrenagem quebrada)', acao: 'Motorredutor substituído e torre realinhada' },
    resultado: 'Motorredutor da torre 6 trocado; pivô completou a volta de teste.',
  },
  {
    diasAtras: 240, hora: '11:05', planta: 'ufv', unidade: 'Campo fotovoltaico', equipamento: 'Bloco C',
    descricao: 'String 3 da caixa de junção C-07 com corrente zero; suspeita de fusível aberto.',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'MEDIA', por: 'renata', instrucoes: ['COR-01'], desfecho: 'corretiva',
    falha: { sintoma: 'String 3 sem corrente', causa: 'Fusível gPV aberto por sobrecorrente reversa', acao: 'Fusível substituído e polaridade da string conferida' },
    resultado: 'Fusível gPV da string 3 substituído; corrente da string em 12,8 A.',
  },
  {
    diasAtras: 224, hora: '08:30', planta: 'laticinio', unidade: 'Subestação de entrada 13,8 kV', equipamento: 'Transformador 2',
    descricao: 'Mancha de óleo na base do transformador 2, junto à válvula de drenagem.',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'MEDIA', por: 'joao', instrucoes: ['COR-04'], desfecho: 'corretiva', parouHoras: 6,
    falha: { sintoma: 'Vazamento de óleo na válvula de drenagem', causa: 'Junta da válvula ressecada', acao: 'Junta substituída e nível de óleo completado' },
    resultado: 'Junta da válvula de drenagem trocada; 14 litros de óleo repostos; sem vazamento após 24 horas.',
  },
  {
    diasAtras: 202, hora: '15:20', planta: 'logistico', unidade: 'Galpões A e B', equipamento: 'Banco de capacitores',
    descricao: 'Célula do estágio 3 estufada; fator de potência caiu para 0,88 e veio cobrança de reativo na fatura.',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'simone', instrucoes: ['COR-07'], desfecho: 'corretiva',
    falha: { sintoma: 'Célula estufada e fator de potência em 0,88', causa: 'Célula capacitiva no fim da vida útil', acao: 'Célula do estágio 3 substituída' },
    resultado: 'Célula do estágio 3 substituída; fator de potência de volta a 0,95.',
  },
  {
    diasAtras: 192, hora: '16:45', planta: 'ufv', unidade: 'Eletrocentro 1', equipamento: 'Inversor 07',
    descricao: 'Inversor 07 sem comunicação e sem geração depois de descarga atmosférica; display apagado.',
    condicao: 'PARADO', origem: 'SCADA', prioridade: 'CRITICA', por: 'carlos', instrucoes: ['COR-02'], desfecho: 'troca', parouHoras: 70,
    falha: { sintoma: 'Inversor sem alimentação de controle e sem comunicação', causa: 'Placa de controle queimada por descarga atmosférica', acao: 'Inversor substituído por um novo (o retirado foi ao fabricante pela garantia)' },
    resultado: 'Inversor substituído pela unidade de reserva; comissionado e gerando normalmente.',
  },
  {
    diasAtras: 176, hora: '07:10', planta: 'fazenda', unidade: 'Irrigação', equipamento: 'Motobomba 02',
    descricao: 'Motobomba 2 desarmando por sobrecorrente logo na partida.',
    condicao: 'PARADO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'andre', instrucoes: ['MOT-03', 'IF-01'], desfecho: 'corretiva', parouHoras: 7,
    falha: { sintoma: 'Desarme por sobrecorrente na partida', causa: 'Rampa de aceleração do inversor alterada indevidamente (2 s)', acao: 'Parâmetro de rampa restaurado para 15 s e isolamento conferido' },
    resultado: 'Rampa de aceleração restaurada; isolamento do motor em 3,2 GΩ; partida normal.',
  },
  {
    diasAtras: 150, hora: '15:35', planta: 'hospital', unidade: 'Subestação abrigada 13,8 kV', equipamento: 'Transformador 2 (a seco)',
    descricao: 'Alarme de temperatura do enrolamento (130 °C) no transformador 2 durante a tarde.',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'ALTA', por: 'claudia', instrucoes: ['TR-01'], desfecho: 'corretiva',
    falha: { sintoma: 'Alarme de 130 °C no enrolamento', causa: 'Ventilador 2 da ventilação forçada queimado', acao: 'Ventilador substituído e alarme testado' },
    resultado: 'Ventilador 2 da ventilação forçada queimado; substituído. Temperatura voltou a 88 °C em carga.',
  },
  {
    diasAtras: 126, hora: '09:00', planta: 'ufv', unidade: 'Eletrocentro 1', equipamento: 'Transformador elevador 1',
    descricao: 'Sílica gel do secador do transformador elevador 1 toda rosa (saturada).',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'BAIXA', por: 'gustavo', instrucoes: ['COR-05'], desfecho: 'corretiva',
    falha: { sintoma: 'Sílica gel do secador saturada', causa: 'Umidade alta da estação chuvosa', acao: 'Sílica gel trocada e selo de óleo completado' },
    resultado: 'Sílica gel trocada (2 kg) e selo de óleo completado.',
  },
  {
    diasAtras: 120, hora: '13:30', planta: 'hospital', unidade: 'Usina fotovoltaica do estacionamento', equipamento: 'Gateway da usina',
    descricao: 'Gateway da usina sem enviar dados ao supervisório desde a madrugada.',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'BAIXA', por: 'renata', instrucoes: ['GW-01'], desfecho: 'cancelada',
  },
  {
    diasAtras: 110, hora: '10:40', planta: 'laticinio', unidade: 'Produção e refrigeração', equipamento: 'QGBT da produção',
    descricao: 'Disjuntor do compressor 1 desarmou duas vezes na semana sem sobrecarga aparente.',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'MEDIA', por: 'rogerio', instrucoes: ['DJBT-02'], desfecho: 'corretiva', parouHoras: 2,
    falha: { sintoma: 'Desarmes do disjuntor do compressor 1', causa: 'Ajuste de curto-retardo abaixo do estudo de seletividade', acao: 'Ajuste Isd corrigido conforme o estudo e terminais reapertados' },
    resultado: 'Ajuste de proteção corrigido; nenhum desarme na semana seguinte.',
  },
  {
    diasAtras: 100, hora: '08:20', planta: 'logistico', unidade: 'Galpões A e B', equipamento: 'Carregador de empilhadeiras',
    descricao: 'Carregador de empilhadeiras não completa a carga das baterias (para em 60%).',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'BAIXA', por: 'simone', instrucoes: [], desfecho: 'corretiva',
    falha: { sintoma: 'Carga das baterias para em 60%', causa: 'Sensor de temperatura do carregador com leitura errada', acao: 'Sensor substituído' },
    resultado: 'Sensor de temperatura do carregador substituído; carga completa em 7 horas.',
  },
  {
    diasAtras: 94, hora: '14:50', planta: 'fazenda', unidade: 'Usina fotovoltaica de autoconsumo', equipamento: 'Inversor 05',
    descricao: 'Inversor 05 limitando a potência a 60% nas tardes (derating por temperatura).',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'MEDIA', por: 'renata', instrucoes: ['INV-02'], desfecho: 'corretiva',
    falha: { sintoma: 'Potência limitada a 60% nas tardes', causa: 'Filtros de ar obstruídos por poeira de colheita', acao: 'Filtros limpos e um substituído' },
    resultado: 'Filtros obstruídos por poeira de colheita; limpos e um substituído. Temperatura interna caiu 14 °C.',
  },
  {
    diasAtras: 80, hora: '19:30', planta: 'logistico', unidade: 'Galpões A e B', equipamento: 'QGBT do galpão A',
    descricao: 'Cheiro de queimado no QGBT do galpão A; aquecimento no barramento de neutro.',
    condicao: 'RISCO_ACIDENTE', origem: 'OPERADOR', prioridade: 'CRITICA', por: 'thiago', instrucoes: ['COR-03'], desfecho: 'corretiva', parouHoras: 4,
    falha: { sintoma: 'Aquecimento e cheiro de queimado no barramento de neutro', causa: 'Conexão do neutro frouxa com harmônicos de terceira ordem', acao: 'Conexão refeita com terminal novo e barramento limpo' },
    resultado: 'Conexão do neutro refeita; termografia após o reparo em 39 °C. Recomendada análise de harmônicos.',
  },
  {
    diasAtras: 66, hora: '07:45', planta: 'ufv', unidade: 'Campo fotovoltaico', equipamento: 'Bloco A',
    descricao: 'Sujidade alta no bloco A depois de queimada na fazenda vizinha; performance ratio caiu 7%.',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'MEDIA', por: 'helena', instrucoes: ['PV-01'], desfecho: 'corretiva',
    falha: { sintoma: 'Queda de 7% no performance ratio do bloco A', causa: 'Fuligem da queimada na fazenda vizinha', acao: 'Lavagem do bloco fora do ciclo' },
    resultado: 'Bloco A lavado fora do ciclo; performance ratio recuperado no dia seguinte.',
  },
  {
    diasAtras: 52, hora: '10:00', planta: 'hospital', unidade: 'Quadros elétricos', equipamento: 'QGBT de emergência',
    descricao: 'A transferência para o gerador demorou 40 segundos no teste mensal (o normal é 10 segundos).',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'claudia', instrucoes: ['DJBT-02'], desfecho: 'corretiva',
    falha: { sintoma: 'Transferência para o gerador em 40 s', causa: 'Temporizador da chave de transferência desajustado', acao: 'Temporizador reajustado para 8 s e teste repetido' },
    resultado: 'Temporizador da transferência reajustado para 8 s; teste repetido com transferência em 9 s.',
  },
  {
    diasAtras: 40, hora: '06:15', planta: 'fazenda', unidade: 'Irrigação', equipamento: 'Pivô 02',
    descricao: 'Pivô 2 desalinhado; parou por segurança na torre 3.',
    condicao: 'PARADO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'andre', instrucoes: ['PIVO-01'], desfecho: 'corretiva', parouHoras: 11,
    falha: { sintoma: 'Parada por segurança de alinhamento na torre 3', causa: 'Microrruptor de alinhamento da torre 3 com folga', acao: 'Microrruptor ajustado e haste de alinhamento fixada' },
    resultado: 'Alinhamento ajustado; pivô completou a volta sem nova parada.',
  },
  {
    diasAtras: 28, hora: '08:50', planta: 'laticinio', unidade: 'Produção e refrigeração', equipamento: 'Compressor de amônia 01',
    descricao: 'Temperatura do mancal do compressor 1 subindo: 78 °C na ronda (tendência de alta).',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'MEDIA', por: 'lucas', instrucoes: ['MOT-01', 'MOT-02'], desfecho: 'corretiva',
    falha: { sintoma: 'Mancal do compressor 1 a 78 °C', causa: 'Graxa contaminada no mancal', acao: 'Mancal limpo e relubrificado' },
    resultado: 'Graxa contaminada; mancal relubrificado. Temperatura estabilizou em 61 °C.',
  },
  // Em aberto, para cada status ter o que mostrar
  {
    diasAtras: 9, hora: '13:20', planta: 'ufv', unidade: 'Eletrocentro 2', equipamento: 'Inversor 14',
    descricao: 'Inversor 14 com alarme intermitente de ventilador (fan fault).',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'MEDIA', por: 'renata', instrucoes: ['INV-02'], desfecho: 'programada',
  },
  {
    diasAtras: 6.2, hora: '09:15', planta: 'logistico', unidade: 'Subestação 13,8 kV', equipamento: 'Transformador 1',
    descricao: 'Termômetro do óleo do transformador 1 marcando 92 °C no horário de pico.',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'thiago', instrucoes: ['TR-01'], desfecho: 'auditada',
    falha: { sintoma: 'Óleo do transformador a 92 °C no pico de carga', causa: 'Radiadores obstruídos por poeira e um ninho de pássaro', acao: 'Radiadores limpos e tela de proteção instalada' },
    resultado: 'Radiadores limpos e protegidos com tela; no pico seguinte o óleo ficou em 71 °C.',
  },
  {
    diasAtras: 6, hora: '15:05', planta: 'logistico', unidade: 'Usina fotovoltaica da cobertura', equipamento: 'Inversor 03',
    descricao: 'Inversor 03 desligando à tarde por sobretensão CA (rede acima de 242 V).',
    condicao: 'FUNCIONANDO', origem: 'SCADA', prioridade: 'MEDIA', por: 'simone', instrucoes: [], desfecho: 'aberta',
  },
  {
    diasAtras: 4, hora: '10:30', planta: 'hospital', unidade: 'Quadros elétricos', equipamento: 'Banco de capacitores',
    descricao: 'Contator do estágio 2 do banco de capacitores fazendo ruído ao fechar.',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'BAIXA', por: 'bruno', instrucoes: ['BC-01'], desfecho: 'aberta',
  },
  {
    diasAtras: 3, hora: '09:40', planta: 'ufv', unidade: 'Subestação elevadora 34,5 kV', equipamento: 'Malha de aterramento e SPDA',
    descricao: 'Cabo de descida do SPDA rompido junto à cerca do lado norte.',
    condicao: 'RISCO_ACIDENTE', origem: 'OPERADOR', prioridade: 'MEDIA', por: 'gustavo', instrucoes: ['SPDA-01'], desfecho: 'aberta',
  },
  {
    diasAtras: 2, hora: '07:55', planta: 'fazenda', unidade: 'Subestação rural 34,5 kV', equipamento: 'Transformador principal',
    descricao: 'Indicador de nível de óleo do transformador principal no mínimo.',
    condicao: 'FUNCIONANDO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'andre', instrucoes: ['TR-01', 'COR-04'], desfecho: 'programada',
  },
  {
    diasAtras: 1.3, hora: '08:10', planta: 'laticinio', unidade: 'Produção e refrigeração', equipamento: 'Soft-starter da bomba de glicol',
    descricao: 'Soft-starter da bomba de glicol desarmando por sobrecorrente na partida.',
    condicao: 'PARADO', origem: 'OPERADOR', prioridade: 'ALTA', por: 'joao', instrucoes: ['MOT-03'], desfecho: 'executada', parouHoras: 5,
    falha: { sintoma: 'Desarme por sobrecorrente na partida da bomba de glicol', causa: 'Rampa de aceleração curta para o motor trocado em setembro', acao: 'Rampa e limite de corrente reajustados para o motor novo' },
    resultado: 'Rampa de aceleração ajustada para 12 s e limite de corrente em 3,5 In; cinco partidas seguidas sem desarme.',
  },
  {
    diasAtras: 1.1, hora: '07:30', planta: 'laticinio', unidade: 'Utilidades', equipamento: 'Bomba de água gelada 02',
    descricao: 'Bomba de água gelada 2 parada: o motor não parte e o disjuntor desarma.',
    condicao: 'PARADO', origem: 'OPERADOR', prioridade: 'CRITICA', por: 'joao', instrucoes: ['MOT-03', 'COR-08'], desfecho: 'em_execucao',
  },
  {
    diasAtras: 0.9, hora: '11:10', planta: 'ufv', unidade: 'Eletrocentro 2', equipamento: 'Inversor 18',
    descricao: 'Inversor 18 com falha de isolamento depois da chuva forte da madrugada.',
    condicao: 'PARADO', origem: 'SCADA', prioridade: 'ALTA', por: 'carlos', instrucoes: ['COR-02'], desfecho: 'pausada',
  },
];

export interface SolicitacaoDoSeed {
  diasAtras: number;
  planta: string;
  unidade: string;
  equipamento?: string;
  titulo: string;
  descricao: string;
  tipo: 'INSTALACAO' | 'INSPECAO' | 'TREINAMENTO' | 'CONSULTORIA' | 'MANUTENCAO_CORRETIVA';
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  justificativa: string;
  instrucoes: string[];
  /** Prazo pedido pelo cliente, em dias depois da solicitação */
  prazoDias: number;
  /**
   * finalizada: vira OS e fecha; programada: programação aprovada, OS por fazer; aberta: proposta em
   * elaboração; revisada: proposta revisada, pronta para programar; nao_aprovada: o cliente recusou
   */
  desfecho: 'finalizada' | 'programada' | 'aberta' | 'revisada' | 'nao_aprovada';
  /** Por que o cliente não aprovou (desfecho nao_aprovada) */
  motivoDaRecusa?: string;
  comentarioDoCliente?: string;
  respostaDaEquipe?: string;
  notaInterna?: string;
}

export const SOLICITACOES: SolicitacaoDoSeed[] = [
  {
    diasAtras: 330, planta: 'laticinio', unidade: 'Subestação de entrada 13,8 kV', equipamento: 'Malha de aterramento e SPDA',
    titulo: 'Laudo de SPDA para renovação do AVCB', descricao: 'O Corpo de Bombeiros pediu o laudo do SPDA com ART para renovar o AVCB da fábrica.',
    tipo: 'INSPECAO', prioridade: 'ALTA', justificativa: 'Sem o laudo o AVCB vence e a fábrica pode ser interditada.', instrucoes: ['SRV-01'], prazoDias: 30, desfecho: 'finalizada',
    comentarioDoCliente: 'O AVCB vence no fim do mês que vem. Conseguem emitir antes?',
    respostaDaEquipe: 'Sim: a inspeção cabe na próxima semana e o laudo sai em até 5 dias úteis depois dela.',
    notaInterna: 'Levar o terrômetro recém-calibrado; o laudo anterior acusou 9,8 Ω na malha da portaria.',
  },
  {
    diasAtras: 300, planta: 'hospital', unidade: 'Quadros elétricos',
    titulo: 'Termografia completa antes da auditoria do seguro', descricao: 'A seguradora pediu relatório termográfico de todos os quadros e da subestação.',
    tipo: 'INSPECAO', prioridade: 'MEDIA', justificativa: 'Exigência da apólice para manter a cobertura de danos elétricos.', instrucoes: ['SRV-02'], prazoDias: 25, desfecho: 'finalizada',
    comentarioDoCliente: 'A auditoria é dia 20. Precisamos do relatório até dia 15.',
    respostaDaEquipe: 'Agendamos para a primeira semana do mês, fora do horário das cirurgias eletivas.',
  },
  {
    diasAtras: 256, planta: 'logistico', unidade: 'Galpões A e B', equipamento: 'QGBT do galpão B',
    titulo: 'Circuito para a nova câmara de climatização do galpão B', descricao: 'Instalar circuito dedicado de 125 A do QGBT do galpão B até a nova câmara.',
    tipo: 'INSTALACAO', prioridade: 'MEDIA', justificativa: 'A câmara entra em operação com o novo contrato de armazenagem.', instrucoes: ['SRV-03'], prazoDias: 20, desfecho: 'finalizada',
    comentarioDoCliente: 'O fornecedor da câmara entrega a máquina no dia 10.',
  },
  {
    diasAtras: 200, planta: 'fazenda', unidade: 'Irrigação',
    titulo: 'Treinamento de reciclagem NR-10 para a equipe da fazenda', descricao: 'Reciclagem de 8 horas para os 6 eletricistas da fazenda, com certificado.',
    tipo: 'TREINAMENTO', prioridade: 'BAIXA', justificativa: 'Os certificados vencem em dois meses.', instrucoes: ['SRV-04'], prazoDias: 45, desfecho: 'finalizada',
  },
  {
    diasAtras: 160, planta: 'ufv', unidade: 'Subestação elevadora 34,5 kV',
    titulo: 'Análise de qualidade de energia na subestação', descricao: 'A distribuidora apontou distorção harmônica acima do limite no ponto de conexão.',
    tipo: 'CONSULTORIA', prioridade: 'ALTA', justificativa: 'Risco de restrição da injeção pela distribuidora.', instrucoes: ['SRV-05'], prazoDias: 30, desfecho: 'finalizada',
    comentarioDoCliente: 'A distribuidora deu 60 dias para apresentarmos a medição.',
    respostaDaEquipe: 'O analisador fica 7 dias instalado; o relatório sai em seguida, dentro do prazo.',
  },
  {
    diasAtras: 116, planta: 'laticinio', unidade: 'Produção e refrigeração', equipamento: 'QGBT da produção',
    titulo: 'Circuito para a nova envasadora', descricao: 'Circuito dedicado do QGBT da produção para a envasadora da linha 3.',
    tipo: 'INSTALACAO', prioridade: 'MEDIA', justificativa: 'A linha 3 começa a operar no próximo trimestre.', instrucoes: ['SRV-03'], prazoDias: 30, desfecho: 'finalizada',
  },
  {
    diasAtras: 70, planta: 'hospital', unidade: 'Quadros elétricos', equipamento: 'Malha de aterramento e SPDA',
    titulo: 'Laudo de SPDA do novo bloco de internação', descricao: 'Inspeção e laudo do SPDA da ampliação (bloco C), com ART.',
    tipo: 'INSPECAO', prioridade: 'MEDIA', justificativa: 'Exigido para o habite-se do novo bloco.', instrucoes: ['SRV-01'], prazoDias: 30, desfecho: 'finalizada',
    notaInterna: 'Conferir se a malha do bloco C foi interligada à malha existente (o projeto diz que sim).',
  },
  {
    diasAtras: 42, planta: 'logistico', unidade: 'Galpões A e B',
    titulo: 'Termografia dos QGBTs antes do pico de fim de ano', descricao: 'Termografia completa dos quadros dos dois galpões antes do aumento de carga de novembro.',
    tipo: 'INSPECAO', prioridade: 'MEDIA', justificativa: 'No ano passado houve desarme no pico.', instrucoes: ['SRV-02'], prazoDias: 30, desfecho: 'finalizada',
  },
  {
    diasAtras: 14, planta: 'ufv', unidade: 'Subestação elevadora 34,5 kV',
    titulo: 'Laudo de SPDA da usina', descricao: 'Laudo anual do SPDA da usina para o seguro, com ART.',
    tipo: 'INSPECAO', prioridade: 'MEDIA', justificativa: 'Renovação da apólice em dezembro.', instrucoes: ['SRV-01'], prazoDias: 30, desfecho: 'programada',
    comentarioDoCliente: 'Podem aproveitar a mesma visita da preventiva de novembro?',
    respostaDaEquipe: 'Podemos: juntamos as duas na mesma ida para economizar o deslocamento.',
  },
  {
    diasAtras: 8, planta: 'fazenda', unidade: 'Usina fotovoltaica de autoconsumo',
    titulo: 'Estudo para ampliar a usina de autoconsumo', descricao: 'Avaliar a ampliação da usina em 400 kW, com o impacto na subestação.',
    tipo: 'CONSULTORIA', prioridade: 'BAIXA', justificativa: 'Os pivôs novos aumentaram o consumo em 30%.', instrucoes: ['SRV-05'], prazoDias: 60, desfecho: 'nao_aprovada',
    motivoDaRecusa: 'O cliente adiou a ampliação da usina para a safra do ano que vem.',
    comentarioDoCliente: 'Queremos saber também se o transformador principal aguenta.',
    notaInterna: 'Pedir a fatura dos últimos 12 meses e a memória de cálculo do transformador.',
  },
  {
    diasAtras: 4, planta: 'hospital', unidade: 'Quadros elétricos', equipamento: 'QGBT normal',
    titulo: 'Tomadas dedicadas para os novos equipamentos de imagem', descricao: 'Circuitos dedicados para o tomógrafo e a ressonância que chegam em dezembro.',
    tipo: 'INSTALACAO', prioridade: 'URGENTE', justificativa: 'Os equipamentos chegam com data marcada de instalação pelo fabricante.', instrucoes: ['SRV-03'], prazoDias: 40, desfecho: 'revisada',
  },
  {
    diasAtras: 1, planta: 'laticinio', unidade: 'Utilidades',
    titulo: 'Qualidade de energia depois da troca dos inversores de frequência', descricao: 'Medir harmônicos no barramento de utilidades depois da troca dos acionamentos.',
    tipo: 'CONSULTORIA', prioridade: 'MEDIA', justificativa: 'Os capacitores do banco esquentaram depois da troca.', instrucoes: ['SRV-05'], prazoDias: 30, desfecho: 'aberta',
  },
];

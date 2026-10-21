/**
 * As cinco plantas do seed: clientes fictícios em Goiás, com as instalações e
 * os equipamentos de cada um. Disjuntores, transformadores e inversores em
 * todas (pedido do usuário, SN-70), cada equipamento numa posição (o ativo
 * funcional) e com os campos técnicos da categoria.
 */
export interface ComponenteDoSeed {
  nome: string;
  modelo?: string;
}

export interface EquipamentoDoSeed {
  /** O nome da posição: é como a tela apresenta o equipamento */
  nome: string;
  modelo: string;
  impacto: number;
  probabilidade: number;
  /** Nível diferente do que a matriz sugere, com o motivo */
  criticidade?: { nivel: number; motivo: string };
  instalado: string;
  garantiaAte?: string;
  valor?: number;
  localizacao?: string;
  componentes?: ComponenteDoSeed[];
  /** Fica sem plano de propósito: a tela de "sem plano" tem o que mostrar */
  semPlano?: boolean;
}

export interface UnidadeDoSeed {
  nome: string;
  tipo: 'Carga' | 'Geração' | 'Misto';
  tipoEnergia: 'Carga' | 'Geração' | 'Carga e Geração';
  numeroUc: string;
  tensao: string;
  potenciaKw: number;
  demandaKw: number;
  /** Dia de início dos planos desta instalação, em dias antes do início da história */
  planosHaDias: number;
  equipamentos: EquipamentoDoSeed[];
}

export interface PlantaDoSeed {
  chave: string;
  nome: string;
  cnpj: string;
  dono: string;
  tecnicos: string[];
  horario: string;
  localizacao: string;
  endereco: { logradouro: string; bairro: string; cidade: string; uf: string; cep: string };
  coordenadas: [number, number];
  /** Ida e volta da base da equipe em Goiânia */
  distanciaKm: number;
  /** Fornecedor e centro de custo do cadastro dos equipamentos */
  fornecedor: string;
  centroCusto: string;
  unidades: UnidadeDoSeed[];
}

/** N equipamentos iguais, numerados com dois dígitos */
function serie(prefixo: string, de: number, ate: number, base: Omit<EquipamentoDoSeed, 'nome'>): EquipamentoDoSeed[] {
  return Array.from({ length: ate - de + 1 }, (_, i) => ({ ...base, nome: `${prefixo} ${String(de + i).padStart(2, '0')}` }));
}

const SECADOR = [{ nome: 'Secador de ar com sílica gel' }, { nome: 'Termômetro do óleo' }];

export const PLANTAS: PlantaDoSeed[] = [
  {
    chave: 'ufv',
    nome: 'UFV Cerrado Solar',
    cnpj: '10.000.001/0001-90',
    dono: 'helena',
    tecnicos: ['carlos', 'rafael', 'gustavo'],
    horario: '06:00 às 18:00',
    localizacao: 'Usina fotovoltaica de 5 MWp na zona rural',
    endereco: { logradouro: 'Rodovia GO-174, km 12', bairro: 'Zona Rural', cidade: 'Rio Verde', uf: 'GO', cep: '75900-000' },
    coordenadas: [-17.86, -50.98],
    distanciaKm: 460,
    fornecedor: 'Solar Centro-Oeste Distribuidora',
    centroCusto: 'CC-1100 Geração',
    unidades: [
      {
        nome: 'Subestação elevadora 34,5 kV',
        tipo: 'Geração',
        tipoEnergia: 'Geração',
        numeroUc: '3001245871',
        tensao: '34,5 kV',
        potenciaKw: 5000,
        demandaKw: 5000,
        planosHaDias: 40,
        equipamentos: [
          { nome: 'Disjuntor geral MT', modelo: 'DJ_MT_EVOLIS', impacto: 5, probabilidade: 2, instalado: '2023-03-14', garantiaAte: '2026-03-14', valor: 98000 },
          { nome: 'Relé de proteção geral', modelo: 'RELE_SEL751', impacto: 5, probabilidade: 1, instalado: '2023-03-14', valor: 32000 },
          { nome: 'TP de medição', modelo: 'TP_36KV', impacto: 3, probabilidade: 1, instalado: '2023-03-14', valor: 9800 },
          { nome: 'TC de proteção', modelo: 'TC_36KV', impacto: 3, probabilidade: 1, instalado: '2023-03-14', valor: 11200 },
          { nome: 'Chave seccionadora de entrada', modelo: 'CH_SECC_36', impacto: 3, probabilidade: 1, instalado: '2023-03-14', valor: 14500 },
          { nome: 'Transformador de serviço auxiliar', modelo: 'TSA', impacto: 3, probabilidade: 1, instalado: '2023-03-14', valor: 21000, componentes: SECADOR },
          { nome: 'Medidor de faturamento', modelo: 'MED_ION8650', impacto: 2, probabilidade: 1, instalado: '2023-03-14', valor: 18500 },
          { nome: 'Malha de aterramento e SPDA', modelo: 'SPDA_MALHA', impacto: 3, probabilidade: 1, instalado: '2023-02-20' },
        ],
      },
      {
        nome: 'Eletrocentro 1',
        tipo: 'Geração',
        tipoEnergia: 'Geração',
        numeroUc: '3001245872',
        tensao: '0,8 kV',
        potenciaKw: 2500,
        demandaKw: 2500,
        planosHaDias: 32,
        equipamentos: [
          { nome: 'Transformador elevador 1', modelo: 'TR_ELEV_2500', impacto: 5, probabilidade: 2, instalado: '2023-03-10', garantiaAte: '2026-09-10', valor: 385000, componentes: SECADOR },
          { nome: 'Disjuntor BT do transformador 1', modelo: 'DJ_BT_MTZ2', impacto: 4, probabilidade: 2, instalado: '2023-03-10', valor: 46000 },
          ...serie('Inversor', 1, 10, { modelo: 'INV_SG250HX', impacto: 3, probabilidade: 3, instalado: '2023-03-12', garantiaAte: '2033-03-12', valor: 96000 }),
          { nome: 'Gateway do eletrocentro 1', modelo: 'A966', impacto: 2, probabilidade: 2, instalado: '2023-03-12', valor: 3200 },
        ],
      },
      {
        nome: 'Eletrocentro 2',
        tipo: 'Geração',
        tipoEnergia: 'Geração',
        numeroUc: '3001245873',
        tensao: '0,8 kV',
        potenciaKw: 2500,
        demandaKw: 2500,
        planosHaDias: 25,
        equipamentos: [
          { nome: 'Transformador elevador 2', modelo: 'TR_ELEV_2500', impacto: 5, probabilidade: 2, instalado: '2023-03-10', garantiaAte: '2026-09-10', valor: 385000, componentes: SECADOR },
          { nome: 'Disjuntor BT do transformador 2', modelo: 'DJ_BT_MTZ2', impacto: 4, probabilidade: 2, instalado: '2023-03-10', valor: 46000 },
          ...serie('Inversor', 11, 20, { modelo: 'INV_SG250HX', impacto: 3, probabilidade: 3, instalado: '2023-03-12', garantiaAte: '2033-03-12', valor: 96000 }),
          { nome: 'Gateway do eletrocentro 2', modelo: 'A966', impacto: 2, probabilidade: 2, instalado: '2023-03-12', valor: 3200 },
        ],
      },
      {
        nome: 'Campo fotovoltaico',
        tipo: 'Geração',
        tipoEnergia: 'Geração',
        numeroUc: '3001245874',
        tensao: '1,5 kVcc',
        potenciaKw: 5000,
        demandaKw: 5000,
        planosHaDias: 18,
        equipamentos: ['A', 'B', 'C', 'D'].map((bloco) => ({
          nome: `Bloco ${bloco}`,
          modelo: 'MOD_TIGER_NEO',
          impacto: 3,
          probabilidade: 2,
          instalado: '2023-02-28',
          garantiaAte: '2053-02-28',
          valor: 610000,
          localizacao: `Mesas ${bloco}-01 a ${bloco}-36`,
        })),
      },
    ],
  },
  {
    chave: 'laticinio',
    nome: 'Laticínios Vale Verde',
    cnpj: '10.000.002/0001-34',
    dono: 'rogerio',
    tecnicos: ['joao', 'lucas'],
    horario: '24 horas (três turnos)',
    localizacao: 'Fábrica de laticínios no distrito agroindustrial',
    endereco: { logradouro: 'Avenida Brasil Norte, 3500', bairro: 'Distrito Agroindustrial', cidade: 'Anápolis', uf: 'GO', cep: '75132-000' },
    coordenadas: [-16.28, -48.97],
    distanciaKm: 110,
    fornecedor: 'Eletro Centro-Oeste Distribuidora',
    centroCusto: 'CC-2100 Utilidades',
    unidades: [
      {
        nome: 'Subestação de entrada 13,8 kV',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '1004587221',
        tensao: '13,8 kV',
        potenciaKw: 2000,
        demandaKw: 1200,
        planosHaDias: 36,
        equipamentos: [
          { nome: 'Disjuntor geral MT', modelo: 'DJ_MT_VD4', impacto: 5, probabilidade: 2, instalado: '2016-08-02', valor: 74000 },
          { nome: 'Relé de proteção geral', modelo: 'RELE_URP6000', impacto: 5, probabilidade: 2, instalado: '2016-08-02', valor: 18000 },
          { nome: 'TC de proteção', modelo: 'TC_15KV', impacto: 3, probabilidade: 1, instalado: '2016-08-02', valor: 6400 },
          { nome: 'TP de medição', modelo: 'TP_15KV', impacto: 3, probabilidade: 1, instalado: '2016-08-02', valor: 5900 },
          { nome: 'Transformador 1', modelo: 'TR_OLEO_1000', impacto: 5, probabilidade: 2, instalado: '2016-08-02', valor: 168000, componentes: SECADOR },
          { nome: 'Transformador 2', modelo: 'TR_OLEO_1000', impacto: 5, probabilidade: 3, instalado: '2018-05-21', valor: 172000, componentes: SECADOR },
          { nome: 'Banco de capacitores', modelo: 'BC_250KVAR', impacto: 2, probabilidade: 3, instalado: '2019-11-11', valor: 42000 },
          { nome: 'Malha de aterramento e SPDA', modelo: 'SPDA_MALHA', impacto: 3, probabilidade: 1, instalado: '2016-07-15' },
        ],
      },
      {
        nome: 'Produção e refrigeração',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '1004587222',
        tensao: '0,38 kV',
        potenciaKw: 900,
        demandaKw: 780,
        planosHaDias: 28,
        equipamentos: [
          {
            nome: 'QGBT da produção',
            modelo: 'QGBT_2000',
            impacto: 5,
            probabilidade: 2,
            instalado: '2016-08-02',
            valor: 210000,
            componentes: [
              { nome: 'Disjuntor do compressor 1', modelo: 'DJ_BT_NSX250' },
              { nome: 'Disjuntor do compressor 2', modelo: 'DJ_BT_NSX250' },
              { nome: 'Disjuntor do compressor 3', modelo: 'DJ_BT_NSX250' },
              { nome: 'Disjuntor da câmara fria', modelo: 'DJ_BT_NSX250' },
            ],
          },
          ...serie('Compressor de amônia', 1, 3, { modelo: 'MOT_W22_150', impacto: 4, probabilidade: 3, instalado: '2017-02-06', valor: 58000 }),
          ...serie('Inversor de frequência do compressor', 1, 3, { modelo: 'IF_CFW11', impacto: 4, probabilidade: 2, instalado: '2017-02-06', valor: 49000 }),
          { nome: 'Soft-starter da bomba de glicol', modelo: 'SS_SSW07', impacto: 2, probabilidade: 2, instalado: '2019-04-03', valor: 6800 },
          { nome: 'Disjuntor geral da câmara fria', modelo: 'DJ_BT_DWB', impacto: 3, probabilidade: 2, instalado: '2019-04-03', valor: 7900 },
        ],
      },
      {
        nome: 'Utilidades',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '1004587223',
        tensao: '0,38 kV',
        potenciaKw: 320,
        demandaKw: 260,
        planosHaDias: 20,
        equipamentos: [
          { nome: 'QGBT de utilidades', modelo: 'QGBT_800', impacto: 4, probabilidade: 2, instalado: '2016-08-02', valor: 96000 },
          ...serie('Bomba de água gelada', 1, 2, { modelo: 'MOT_W22_75', impacto: 4, probabilidade: 3, instalado: '2018-10-15', valor: 27000 }),
          { nome: 'Medidor de energia das utilidades', modelo: 'METER_M160', impacto: 2, probabilidade: 1, instalado: '2022-01-19', valor: 2900, semPlano: true },
        ],
      },
    ],
  },
  {
    chave: 'hospital',
    nome: 'Hospital Vida Plena',
    cnpj: '10.000.003/0001-89',
    dono: 'claudia',
    tecnicos: ['bruno', 'thiago', 'lucas'],
    horario: '24 horas',
    localizacao: 'Hospital geral com 180 leitos e centro cirúrgico',
    endereco: { logradouro: 'Rua T-55, 1200', bairro: 'Setor Bueno', cidade: 'Goiânia', uf: 'GO', cep: '74215-170' },
    coordenadas: [-16.71, -49.27],
    distanciaKm: 24,
    fornecedor: 'Eletro Centro-Oeste Distribuidora',
    centroCusto: 'CC-3100 Infraestrutura hospitalar',
    unidades: [
      {
        nome: 'Subestação abrigada 13,8 kV',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '1007331459',
        tensao: '13,8 kV',
        potenciaKw: 1500,
        demandaKw: 980,
        planosHaDias: 44,
        equipamentos: [
          { nome: 'Disjuntor geral MT', modelo: 'DJ_MT_VD4', impacto: 5, probabilidade: 2, instalado: '2014-06-30', valor: 71000 },
          { nome: 'Relé de proteção geral', modelo: 'RELE_SEL751', impacto: 5, probabilidade: 1, instalado: '2021-09-08', valor: 31000 },
          { nome: 'TC de proteção', modelo: 'TC_15KV', impacto: 3, probabilidade: 1, instalado: '2014-06-30', valor: 6100 },
          { nome: 'TP de medição', modelo: 'TP_15KV', impacto: 3, probabilidade: 1, instalado: '2014-06-30', valor: 5600 },
          { nome: 'Transformador 1 (a seco)', modelo: 'TR_SECO_750', impacto: 5, probabilidade: 2, instalado: '2014-06-30', valor: 154000 },
          { nome: 'Transformador 2 (a seco)', modelo: 'TR_SECO_750', impacto: 5, probabilidade: 2, instalado: '2014-06-30', valor: 154000 },
        ],
      },
      {
        nome: 'Quadros elétricos',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '1007331460',
        tensao: '0,38 kV',
        potenciaKw: 1100,
        demandaKw: 860,
        planosHaDias: 38,
        equipamentos: [
          {
            nome: 'QGBT normal',
            modelo: 'QGBT_2000',
            impacto: 5,
            probabilidade: 2,
            instalado: '2014-06-30',
            valor: 230000,
            componentes: [
              { nome: 'Alimentador do bloco cirúrgico', modelo: 'DJ_BT_NSX250' },
              { nome: 'Alimentador da UTI', modelo: 'DJ_BT_NSX250' },
              { nome: 'Alimentador do ar-condicionado central', modelo: 'DJ_BT_DWB' },
            ],
          },
          {
            nome: 'QGBT de emergência',
            modelo: 'QGBT_800',
            impacto: 5,
            probabilidade: 2,
            criticidade: { nivel: 5, motivo: 'Alimenta o bloco cirúrgico e a UTI pelo gerador: falha aqui é risco à vida do paciente.' },
            instalado: '2014-06-30',
            valor: 118000,
            componentes: [
              { nome: 'Alimentador do bloco cirúrgico (emergência)', modelo: 'DJ_BT_NSX250' },
              { nome: 'Alimentador da UTI (emergência)', modelo: 'DJ_BT_NSX250' },
            ],
          },
          { nome: 'Banco de capacitores', modelo: 'BC_250KVAR', impacto: 2, probabilidade: 3, instalado: '2020-03-02', valor: 41000 },
          { nome: 'Malha de aterramento e SPDA', modelo: 'SPDA_MALHA', impacto: 3, probabilidade: 1, instalado: '2014-05-12' },
        ],
      },
      {
        nome: 'Usina fotovoltaica do estacionamento',
        tipo: 'Geração',
        tipoEnergia: 'Geração',
        numeroUc: '1007331461',
        tensao: '0,38 kV',
        potenciaKw: 300,
        demandaKw: 300,
        planosHaDias: 15,
        equipamentos: [
          ...serie('Inversor', 1, 3, { modelo: 'INV_SUN2000_100', impacto: 2, probabilidade: 3, instalado: '2024-08-19', garantiaAte: '2034-08-19', valor: 41000 }),
          { nome: 'Módulos do estacionamento', modelo: 'PAINEL_SOLAR', impacto: 2, probabilidade: 2, instalado: '2024-08-15', garantiaAte: '2049-08-15', valor: 235000 },
          { nome: 'Gateway da usina', modelo: 'IMS_A966', impacto: 1, probabilidade: 2, instalado: '2024-08-19', valor: 2800, semPlano: true },
        ],
      },
    ],
  },
  {
    chave: 'fazenda',
    nome: 'Fazenda Santa Bárbara',
    cnpj: '10.000.004/0001-23',
    dono: 'marcelo',
    tecnicos: ['andre', 'rafael', 'gustavo'],
    horario: '05:00 às 22:00 (irrigação noturna na safra)',
    localizacao: 'Fazenda de grãos irrigada, seis pivôs e usina de autoconsumo',
    endereco: { logradouro: 'Rodovia BR-251, km 30', bairro: 'Zona Rural', cidade: 'Cristalina', uf: 'GO', cep: '73850-000' },
    coordenadas: [-16.81, -47.52],
    distanciaKm: 560,
    fornecedor: 'Agro Irrigação Planalto',
    centroCusto: 'CC-4100 Irrigação',
    unidades: [
      {
        nome: 'Subestação rural 34,5 kV',
        tipo: 'Misto',
        tipoEnergia: 'Carga e Geração',
        numeroUc: '2009914583',
        tensao: '34,5 kV',
        potenciaKw: 1500,
        demandaKw: 1350,
        planosHaDias: 34,
        equipamentos: [
          { nome: 'Chave fusível de entrada', modelo: 'CHAVE_FUSIVEL', impacto: 3, probabilidade: 2, instalado: '2019-07-08', valor: 4200 },
          { nome: 'Transformador principal', modelo: 'TR_OLEO_1500', impacto: 5, probabilidade: 2, instalado: '2019-07-08', valor: 236000, componentes: SECADOR },
          { nome: 'Disjuntor geral MT', modelo: 'DJ_MT_EVOLIS', impacto: 5, probabilidade: 2, instalado: '2019-07-08', valor: 92000 },
          { nome: 'Relé de proteção geral', modelo: 'RELE_URP6000', impacto: 5, probabilidade: 2, instalado: '2019-07-08', valor: 17500 },
          { nome: 'TP de medição', modelo: 'TP_36KV', impacto: 3, probabilidade: 1, instalado: '2019-07-08', valor: 9400 },
        ],
      },
      {
        nome: 'Irrigação',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '2009914584',
        tensao: '0,38 kV',
        potenciaKw: 1200,
        demandaKw: 1100,
        planosHaDias: 26,
        equipamentos: [
          ...serie('Pivô', 1, 6, { modelo: 'PIVO', impacto: 3, probabilidade: 3, instalado: '2019-09-02', valor: 410000 }),
          ...serie('Motobomba', 1, 3, { modelo: 'MOT_W22_150', impacto: 4, probabilidade: 3, instalado: '2019-09-02', valor: 61000 }),
          ...serie('Inversor de frequência da motobomba', 1, 3, { modelo: 'IF_ATV630', impacto: 4, probabilidade: 2, instalado: '2019-09-02', valor: 38000 }),
        ],
      },
      {
        nome: 'Usina fotovoltaica de autoconsumo',
        tipo: 'Geração',
        tipoEnergia: 'Geração',
        numeroUc: '2009914585',
        tensao: '0,38 kV',
        potenciaKw: 800,
        demandaKw: 800,
        planosHaDias: 14,
        equipamentos: [
          ...serie('Inversor', 1, 8, { modelo: 'INV_SUN2000_100', impacto: 3, probabilidade: 3, instalado: '2025-02-10', garantiaAte: '2035-02-10', valor: 40500 }),
          { nome: 'Bloco Norte', modelo: 'MOD_TIGER_NEO', impacto: 3, probabilidade: 2, instalado: '2025-02-03', garantiaAte: '2055-02-03', valor: 405000 },
          { nome: 'Bloco Sul', modelo: 'MOD_TIGER_NEO', impacto: 3, probabilidade: 2, instalado: '2025-02-03', garantiaAte: '2055-02-03', valor: 405000 },
          { nome: 'Gateway da usina', modelo: 'A966', impacto: 2, probabilidade: 2, instalado: '2025-02-10', valor: 3100 },
        ],
      },
    ],
  },
  {
    chave: 'logistico',
    nome: 'Centro Logístico Anhanguera',
    cnpj: '10.000.005/0001-78',
    dono: 'simone',
    tecnicos: ['thiago', 'joao', 'bruno'],
    horario: '24 horas (doca fecha das 23:00 às 05:00)',
    localizacao: 'Condomínio logístico com dois galpões refrigerados',
    endereco: { logradouro: 'Avenida Rio Verde, 9000', bairro: 'Parque Industrial', cidade: 'Aparecida de Goiânia', uf: 'GO', cep: '74934-600' },
    coordenadas: [-16.84, -49.24],
    distanciaKm: 44,
    fornecedor: 'Eletro Centro-Oeste Distribuidora',
    centroCusto: 'CC-5100 Facilities',
    unidades: [
      {
        nome: 'Subestação 13,8 kV',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '1011208736',
        tensao: '13,8 kV',
        potenciaKw: 1000,
        demandaKw: 720,
        planosHaDias: 30,
        equipamentos: [
          { nome: 'Disjuntor geral MT', modelo: 'DJ_MT_VD4', impacto: 5, probabilidade: 2, instalado: '2021-04-26', valor: 76000 },
          { nome: 'Relé de proteção geral', modelo: 'RELE_SEL751', impacto: 5, probabilidade: 1, instalado: '2021-04-26', valor: 31500 },
          { nome: 'Transformador 1', modelo: 'TR_OLEO_1000', impacto: 5, probabilidade: 2, instalado: '2021-04-26', valor: 171000, componentes: SECADOR },
          { nome: 'TC de proteção', modelo: 'TC_15KV', impacto: 3, probabilidade: 1, instalado: '2021-04-26', valor: 6300 },
        ],
      },
      {
        nome: 'Galpões A e B',
        tipo: 'Carga',
        tipoEnergia: 'Carga',
        numeroUc: '1011208737',
        tensao: '0,38 kV',
        potenciaKw: 820,
        demandaKw: 640,
        planosHaDias: 22,
        equipamentos: [
          { nome: 'QGBT do galpão A', modelo: 'QGBT_2000', impacto: 4, probabilidade: 2, instalado: '2021-04-26', valor: 198000 },
          { nome: 'QGBT do galpão B', modelo: 'QGBT_800', impacto: 4, probabilidade: 2, instalado: '2021-04-26', valor: 102000 },
          { nome: 'Banco de capacitores', modelo: 'BC_250KVAR', impacto: 2, probabilidade: 3, instalado: '2021-04-26', valor: 40500 },
          { nome: 'Carregador de empilhadeiras', modelo: 'CARREGADOR_ELETRICO', impacto: 1, probabilidade: 2, instalado: '2023-10-02', valor: 18700 },
          { nome: 'Malha de aterramento e SPDA', modelo: 'SPDA_MALHA', impacto: 3, probabilidade: 1, instalado: '2021-03-30' },
        ],
      },
      {
        nome: 'Usina fotovoltaica da cobertura',
        tipo: 'Geração',
        tipoEnergia: 'Geração',
        numeroUc: '1011208738',
        tensao: '0,38 kV',
        potenciaKw: 450,
        demandaKw: 450,
        planosHaDias: 12,
        equipamentos: [
          ...serie('Inversor', 1, 4, { modelo: 'INV_GROWATT_75', impacto: 2, probabilidade: 3, instalado: '2025-08-11', garantiaAte: '2035-08-11', valor: 29000 }),
          // Os dois últimos chegaram há pouco: o plano ainda não foi definido
          ...serie('Inversor', 5, 6, { modelo: 'INV_GROWATT_75', impacto: 2, probabilidade: 3, instalado: '2026-09-28', garantiaAte: '2036-09-28', valor: 31000, semPlano: true }),
          { nome: 'Gateway da usina', modelo: 'A966', impacto: 1, probabilidade: 2, instalado: '2025-08-11', valor: 3000, semPlano: true },
        ],
      },
    ],
  },
];

/**
 * Os campos técnicos de cada equipamento, com as chaves, os tipos e as
 * unidades da tela (front: `config/campos-por-categoria.ts`). O que a
 * categoria não define vai como campo personalizado, que a tela mostra à parte.
 */
export interface CampoTecnico {
  campo: string;
  valor: string;
  tipo: 'text' | 'number' | 'select';
  unidade?: string;
}

const t = (campo: string, valor: string): CampoTecnico => ({ campo, valor, tipo: 'text' });
const n = (campo: string, valor: number, unidade?: string): CampoTecnico => ({ campo, valor: String(valor), tipo: 'number', ...(unidade && { unidade }) });
const s = (campo: string, valor: string): CampoTecnico => ({ campo, valor, tipo: 'select' });

/** Pelo código do modelo: o mesmo modelo tem a mesma placa */
const POR_MODELO: Record<string, (serie: string, ano: string) => CampoTecnico[]> = {
  INV_SG250HX: (serie) => [n('potencia_nominal', 250, 'kW'), t('n_serie', serie), t('tensao_de_entrada', '500 a 1500 Vcc (MPPT 860 a 1300 V)'), t('tensao_de_saida', '800 Vca trifásico'), n('rendimento', 99, '%'), n('numero_de_mppts', 12), t('tipo_de_comunicacao', 'RS485 / Modbus TCP')],
  INV_SUN2000_100: (serie) => [n('potencia_nominal', 100, 'kW'), t('n_serie', serie), t('tensao_de_entrada', '200 a 1100 Vcc'), t('tensao_de_saida', '380 Vca trifásico'), n('rendimento', 98.8, '%'), n('numero_de_mppts', 10), t('tipo_de_comunicacao', 'RS485 / Wi-Fi')],
  INV_GROWATT_75: (serie) => [n('potencia_nominal', 75, 'kW'), t('n_serie', serie), t('tensao_de_entrada', '200 a 1100 Vcc'), t('tensao_de_saida', '380 Vca trifásico'), n('rendimento', 98.6, '%'), n('numero_de_mppts', 7), t('tipo_de_comunicacao', 'RS485')],
  MOD_TIGER_NEO: () => [n('qnt_modulo', 2156), n('potencia_nominal', 580, 'Wp'), t('tensao_e_corrente_de_operacao', '42,6 V / 13,6 A'), t('tipo_de_celula', 'Monocristalina tipo N bifacial'), n('eficiencia', 22.4, '%'), n('numero_de_celulas', 144), t('garantia_do_fabricante', '30 anos de potência linear'), t('n_modulo_em_serie', '28')],
  PAINEL_SOLAR: () => [n('qnt_modulo', 540), n('potencia_nominal', 555, 'Wp'), t('tensao_e_corrente_de_operacao', '41,8 V / 13,3 A'), t('tipo_de_celula', 'Monocristalina'), n('eficiencia', 21.5, '%'), n('numero_de_celulas', 144), t('garantia_do_fabricante', '25 anos'), t('n_modulo_em_serie', '18')],
  TR_ELEV_2500: (serie) => [n('potencia_nominal', 2500, 'kVA'), t('n_serie', serie), t('tensao_primaria_e_secundaria', '34,5 kV / 0,8 kV'), t('tipo_de_refrigeracao', 'ONAN'), n('impedancia', 6.5, '%'), t('grupo_de_ligacao', 'Dyn1'), t('nivel_de_isolamento', '36 kV / 170 kV NBI'), t('ct', 'Comutador sem carga ±2 x 2,5%')],
  TR_OLEO_1000: (serie) => [n('potencia_nominal', 1000, 'kVA'), t('n_serie', serie), t('tensao_primaria_e_secundaria', '13,8 kV / 380-220 V'), t('tipo_de_refrigeracao', 'ONAN'), n('impedancia', 5, '%'), t('grupo_de_ligacao', 'Dyn1'), t('nivel_de_isolamento', '15 kV / 95 kV NBI'), t('ct', 'Comutador sem carga ±2 x 2,5%')],
  TR_OLEO_1500: (serie) => [n('potencia_nominal', 1500, 'kVA'), t('n_serie', serie), t('tensao_primaria_e_secundaria', '34,5 kV / 380-220 V'), t('tipo_de_refrigeracao', 'ONAN'), n('impedancia', 5.5, '%'), t('grupo_de_ligacao', 'Dyn1'), t('nivel_de_isolamento', '36 kV / 170 kV NBI'), t('ct', 'Comutador sem carga ±2 x 2,5%')],
  TR_SECO_750: (serie) => [n('potencia_nominal', 750, 'kVA'), t('n_serie', serie), t('tensao_primaria_e_secundaria', '13,8 kV / 380-220 V'), t('tipo_de_refrigeracao', 'A SECO (AN/AF)'), n('impedancia', 6, '%'), t('grupo_de_ligacao', 'Dyn1'), t('nivel_de_isolamento', '15 kV / 95 kV NBI'), t('ct', 'Classe F, ventilação forçada')],
  TRANSFORMADOR: (serie) => [n('potencia_nominal', 75, 'kVA'), t('n_serie', serie), t('tensao_primaria_e_secundaria', '34,5 kV / 380-220 V'), t('tipo_de_refrigeracao', 'ONAN'), n('impedancia', 4, '%'), t('grupo_de_ligacao', 'Dyn1')],
  TSA: (serie) => [n('potencia_nominal', 75, 'kVA'), t('n_serie', serie), t('tensao_primaria_e_secundaria', '34,5 kV / 380-220 V'), t('tipo_de_refrigeracao', 'ONAN'), n('impedancia', 4, '%'), t('grupo_de_ligacao', 'Dyn1'), t('nivel_de_isolamento', '36 kV / 170 kV NBI')],
  MOT_W22_150: (serie) => [n('potencia', 110, 'kW'), t('tensao_nominal', '380/660 V'), t('corrente_nominal', '198 A'), t('fator_de_servico', '1,15'), n('numero_de_polos', 4), t('grau_de_protecao', 'IP55'), t('classe_de_isolamento', 'F (ΔT 80 K)'), t('tipo_de_partida', 'Inversor de frequência'), t('n_serie', serie)],
  MOT_W22_75: (serie) => [n('potencia', 55, 'kW'), t('tensao_nominal', '380/660 V'), t('corrente_nominal', '101 A'), t('fator_de_servico', '1,15'), n('numero_de_polos', 2), t('grau_de_protecao', 'IP55'), t('classe_de_isolamento', 'F (ΔT 80 K)'), t('tipo_de_partida', 'Estrela-triângulo'), t('n_serie', serie)],
  BC_250KVAR: (serie) => [n('potencia_reativa', 250, 'kVAr'), t('n_serie', serie), t('tensao_nominal', '440 V'), t('frequencia', '60 Hz'), t('celula', '10 x 25 kVAr'), s('tipo_de_controle', 'Automatico'), t('protecao_contra_sobrecorrente', 'Fusível NH por estágio')],
  QGBT_2000: (serie) => [t('corrente_nominal', '2000 A'), t('n_serie', serie), n('numero_de_barramentos', 2), t('tipo_de_disjuntores', 'Aberto (entrada) e caixa moldada (saídas)'), t('grau_de_protecao', 'IP42'), t('forma_de_separacao_interna', 'Forma 3b'), t('capacidade_de_curto_circuito', '50 kA / 1 s')],
  QGBT_800: (serie) => [t('corrente_nominal', '800 A'), t('n_serie', serie), n('numero_de_barramentos', 1), t('tipo_de_disjuntores', 'Caixa moldada'), t('grau_de_protecao', 'IP41'), t('forma_de_separacao_interna', 'Forma 2'), t('capacidade_de_curto_circuito', '25 kA / 1 s')],
  SPDA_MALHA: () => [t('tipo_de_sistema', 'Malha com hastes e anel perimetral'), n('resistencia_de_aterramento', 4.2, 'Ω'), n('numero_de_hastes', 24), t('tipo_de_condutor', 'Cobre nu 50 mm²'), t('tipo_de_conectores', 'Solda exotérmica e conector tipo split-bolt')],
  TP_15KV: (serie, ano) => [t('tipo', 'TP de medição'), t('n_serie', serie), s('uso', 'Interno'), t('norma', 'NBR 6855'), t('freq', '60 Hz'), t('pterm', '400 VA'), t('fst', '1,2'), t('exatidao', '0,3P75'), t('umax', '15 kV'), t('uprim', '13.800 V'), t('usec', '115 V'), t('rn', '120:1'), t('ano', ano), t('isol', '15/38/95 kV')],
  TP_36KV: (serie, ano) => [t('tipo', 'TP de medição'), t('n_serie', serie), s('uso', 'Externo'), t('norma', 'NBR 6855'), t('freq', '60 Hz'), t('pterm', '500 VA'), t('fst', '1,2'), t('exatidao', '0,3P75'), t('umax', '36 kV'), t('uprim', '34.500 V'), t('usec', '115 V'), t('rn', '300:1'), t('ano', ano), t('isol', '36/70/170 kV')],
  TC_15KV: (serie, ano) => [t('tipo', 'TC de proteção'), t('n_serie', serie), t('ano', ano), t('ip', '200 A'), t('is', '5 A'), t('rn', '40:1'), t('umax', '15 kV'), t('exatidao', '10B200'), t('it_id', '20 kA / 50 kA'), t('isol', '15/38/95 kV'), t('ft', '1,2'), t('norma', 'NBR 6856')],
  TC_36KV: (serie, ano) => [t('tipo', 'TC de proteção'), t('n_serie', serie), t('ano', ano), t('ip', '150 A'), t('is', '5 A'), t('rn', '30:1'), t('umax', '36 kV'), t('exatidao', '10B200'), t('it_id', '16 kA / 40 kA'), t('isol', '36/70/170 kV'), t('ft', '1,2'), t('norma', 'NBR 6856')],
  // Sem campos padrão na categoria: vão como personalizados
  DJ_MT_VD4: (serie) => [t('n_serie', serie), t('corrente_nominal', '630 A'), t('capacidade_de_interrupcao', '25 kA'), t('meio_de_extincao', 'Vácuo')],
  DJ_MT_EVOLIS: (serie) => [t('n_serie', serie), t('corrente_nominal', '630 A'), t('capacidade_de_interrupcao', '25 kA'), t('meio_de_extincao', 'Vácuo')],
  DJ_BT_MTZ2: (serie) => [t('n_serie', serie), t('corrente_nominal', '2000 A'), t('capacidade_de_interrupcao', '66 kA'), t('unidade_de_controle', 'MicroLogic 5.0 X')],
  DJ_BT_NSX250: (serie) => [t('n_serie', serie), t('corrente_nominal', '250 A'), t('capacidade_de_interrupcao', '50 kA')],
  DJ_BT_DWB: (serie) => [t('n_serie', serie), t('corrente_nominal', '400 A'), t('capacidade_de_interrupcao', '50 kA')],
  RELE_SEL751: (serie) => [t('n_serie', serie), t('funcoes', '50/51, 50N/51N, 27/59, 81'), t('firmware', 'R415')],
  RELE_URP6000: (serie) => [t('n_serie', serie), t('funcoes', '50/51, 50N/51N'), t('firmware', '3.12')],
  IF_CFW11: (serie) => [t('n_serie', serie), t('potencia', '150 cv'), t('corrente_nominal', '211 A')],
  IF_ATV630: (serie) => [t('n_serie', serie), t('potencia', '75 kW'), t('corrente_nominal', '145 A')],
  PIVO: (serie) => [t('n_serie', serie), t('numero_de_torres', '9'), t('area_irrigada', '110 ha'), t('tensao', '380 V')],
};

export function camposTecnicos(modelo: string, numeroSerie: string, ano: string): CampoTecnico[] {
  return POR_MODELO[modelo]?.(numeroSerie, ano) ?? [t('n_serie', numeroSerie)];
}

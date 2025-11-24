import { Injectable } from '@nestjs/common';
import {
  TipoHorario,
  ClassificacaoHorario,
  TarifasConcessionaria,
  DadosUnidade,
  ConfiguracaoHorarios,
} from '../interfaces/calculo-custos.interface';

/**
 * Serviço responsável por classificar horários em tipos tarifários
 *
 * Prioridade de classificação:
 * 1. IRRIGANTE (se unidade é irrigante e horário está no período de desconto)
 * 2. PONTA (17h-20h dias úteis)
 * 3. RESERVADO (demais horários)
 * 4. FORA_PONTA (na prática, HR = FP na tarifa Verde)
 */
@Injectable()
export class ClassificacaoHorariosService {
  private readonly config: ConfiguracaoHorarios = {
    hora_inicio_ponta: 17,
    hora_fim_ponta: 20,
    hora_inicio_irrigante_decimal: 21.5, // 21:30
    hora_fim_irrigante: 6,
    percentual_desconto_irrigante: 0.80, // 80% desconto na TE
  };

  /**
   * Classifica um timestamp específico e retorna o tipo de horário e tarifas aplicáveis
   */
  classificar(
    timestamp: Date,
    unidade: DadosUnidade,
    tarifas: TarifasConcessionaria,
  ): ClassificacaoHorario {
    const hora = timestamp.getHours();
    const minutos = timestamp.getMinutes();
    const horaDecimal = hora + minutos / 60;
    const diaSemana = timestamp.getDay(); // 0 = domingo, 6 = sábado

    // Verificar se é dia útil (segunda a sexta)
    const isDiaUtil = diaSemana >= 1 && diaSemana <= 5;

    // PRIORIDADE 1: Irrigante (se aplicável)
    if (unidade.irrigante) {
      const isHorarioIrrigante = this.isHorarioIrrigante(horaDecimal);

      if (isHorarioIrrigante) {
        return this.criarClassificacaoIrrigante(unidade, tarifas);
      }
    }

    // PRIORIDADE 2: Ponta (17h-20h dias úteis)
    if (isDiaUtil && hora >= this.config.hora_inicio_ponta && hora < this.config.hora_fim_ponta) {
      return this.criarClassificacaoPonta(unidade, tarifas);
    }

    // PRIORIDADE 3 e 4: Reservado ou Fora de Ponta
    // Na tarifa Verde: HR = FP, mas mantemos separado para clareza
    return this.criarClassificacaoReservadoOuForaPonta(unidade, tarifas);
  }

  /**
   * Verifica se hora está no período irrigante (21:30 - 06:00)
   */
  private isHorarioIrrigante(horaDecimal: number): boolean {
    // Período atravessa meia-noite: 21:30 até 06:00
    return (
      horaDecimal >= this.config.hora_inicio_irrigante_decimal || // >= 21:30
      horaDecimal < this.config.hora_fim_irrigante // < 06:00
    );
  }

  /**
   * Cria classificação para horário PONTA
   */
  private criarClassificacaoPonta(
    unidade: DadosUnidade,
    tarifas: TarifasConcessionaria,
  ): ClassificacaoHorario {
    if (unidade.grupo === 'A') {
      const tusd = tarifas.tusd_p || 0;
      const te = tarifas.te_p || 0;

      return {
        tipo: TipoHorario.PONTA,
        tarifa_tusd: tusd,
        tarifa_te: te,
        tarifa_total: tusd + te,
        desconto_irrigante: false,
      };
    }

    // Grupo B não tem diferenciação de horário de ponta
    return this.criarClassificacaoGrupoB(tarifas);
  }

  /**
   * Cria classificação para horário IRRIGANTE
   * Desconto de 80% aplicado SOMENTE na TE
   */
  private criarClassificacaoIrrigante(
    unidade: DadosUnidade,
    tarifas: TarifasConcessionaria,
  ): ClassificacaoHorario {
    if (unidade.grupo === 'A') {
      // Usar tarifas de Fora de Ponta como base
      const tusd = tarifas.tusd_fp || 0;
      const te_original = tarifas.te_fp || 0;

      // Aplicar desconto de 80% SOMENTE na TE
      const te_com_desconto = te_original * (1 - this.config.percentual_desconto_irrigante);

      return {
        tipo: TipoHorario.IRRIGANTE,
        tarifa_tusd: tusd,
        tarifa_te: te_com_desconto,
        tarifa_total: tusd + te_com_desconto,
        desconto_irrigante: true,
      };
    }

    // Grupo B com desconto irrigante
    const tusd = tarifas.tusd_b || 0;
    const te_original = tarifas.te_b || 0;
    const te_com_desconto = te_original * (1 - this.config.percentual_desconto_irrigante);

    return {
      tipo: TipoHorario.IRRIGANTE,
      tarifa_tusd: tusd,
      tarifa_te: te_com_desconto,
      tarifa_total: tusd + te_com_desconto,
      desconto_irrigante: true,
    };
  }

  /**
   * Cria classificação para horário RESERVADO ou FORA_PONTA
   * Na tarifa Verde: HR = FP
   */
  private criarClassificacaoReservadoOuForaPonta(
    unidade: DadosUnidade,
    tarifas: TarifasConcessionaria,
  ): ClassificacaoHorario {
    if (unidade.grupo === 'A') {
      const tusd = tarifas.tusd_fp || 0;
      const te = tarifas.te_fp || 0;

      // Usamos RESERVADO como tipo principal, pois HR = FP na Verde
      return {
        tipo: TipoHorario.RESERVADO,
        tarifa_tusd: tusd,
        tarifa_te: te,
        tarifa_total: tusd + te,
        desconto_irrigante: false,
      };
    }

    // Grupo B não tem diferenciação de horário
    return this.criarClassificacaoGrupoB(tarifas);
  }

  /**
   * Cria classificação para Grupo B (tarifa única)
   */
  private criarClassificacaoGrupoB(
    tarifas: TarifasConcessionaria,
  ): ClassificacaoHorario {
    const tusd = tarifas.tusd_b || 0;
    const te = tarifas.te_b || 0;

    return {
      tipo: TipoHorario.FORA_PONTA, // Grupo B usa FP como referência
      tarifa_tusd: tusd,
      tarifa_te: te,
      tarifa_total: tusd + te,
      desconto_irrigante: false,
    };
  }

  /**
   * Retorna a configuração de horários atual (útil para testes e documentação)
   */
  getConfiguracao(): ConfiguracaoHorarios {
    return { ...this.config };
  }
}

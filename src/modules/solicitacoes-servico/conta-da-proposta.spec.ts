import { BadRequestException } from '@nestjs/common';
import { contaDaProposta, totalDaLinha, type EntradaDaConta } from './conta-da-proposta';

/**
 * A conta da proposta por imposto e margem (29/out/2026), que substitui o BDI:
 *   preço dos serviços = custo ÷ (1 − (imposto + margem))
 *   preço da adm       = (adm% × custo dos serviços + adm FD% × FD) ÷ (1 − imposto)
 *   desconto           = sobre o total inteiro, abatido do faturamento da Aupus
 */
describe('a conta da proposta', () => {
  const percentuais = { imposto: 15, margem: 20, admServicos: 5, admFd: 2 };
  const entrada = (mudar: Partial<EntradaDaConta> = {}): EntradaDaConta => ({
    instrucoes: [10000],
    logistica: [],
    adicionais: [],
    percentuais,
    desconto: { tipo: null, valor: null },
    ...mudar,
  });

  it('o exemplo da spec: custo de R$ 10.000, imposto 15% e margem 20% dão R$ 15.384,62', () => {
    const conta = contaDaProposta(entrada({ percentuais: { ...percentuais, admServicos: 0, admFd: 0 } }));
    expect(conta.precoServicos).toBe(15384.62);
    expect(conta.totalAupus).toBe(15384.62);
    expect(conta.imposto).toBe(2307.69);
    expect(conta.margemEfetiva).toBeCloseTo(20, 2);
  });

  it('a administração leva só o imposto; o faturamento direto entra no global e fora da receita da Aupus', () => {
    const conta = contaDaProposta(entrada({ adicionais: [{ valor: 5000, faturamento_direto: true }] }));
    expect(conta).toMatchObject({
      custoServicos: 10000,
      fd: 5000,
      precoServicos: 15384.62,
      administracao: 600,
      precoAdministracao: 705.88,
      totalAupus: 16090.5,
      totalGeral: 21090.5,
      imposto: 2413.57,
    });
    // A administração é receita da Aupus: a margem efetiva passa dos 20%
    expect(conta.margemEfetiva).toBeCloseTo(22.852, 3);
  });

  it('o desconto é sobre o total inteiro e sai do faturamento da Aupus; o imposto incide depois dele', () => {
    const conta = contaDaProposta(
      entrada({ adicionais: [{ valor: 5000, faturamento_direto: true }], desconto: { tipo: 'PERCENTUAL', valor: 10 } }),
    );
    expect(conta.desconto).toEqual({ pedido: 2109.05, aplicado: 2109.05 });
    expect(conta).toMatchObject({ totalAupus: 13981.45, totalGeral: 18981.45, imposto: 2097.22 });
    expect(conta.margemEfetiva).toBeCloseTo(13.477, 3);
  });

  it('o desconto maior que o faturamento da Aupus para nele: o FD é nota do fornecedor', () => {
    const conta = contaDaProposta(
      entrada({ instrucoes: [100], adicionais: [{ valor: 5000, faturamento_direto: true }], desconto: { tipo: 'VALOR', valor: 1000 } }),
    );
    expect(conta.desconto.pedido).toBe(1000);
    expect(conta.desconto.aplicado).toBe(conta.totalAupusSemDesconto);
    expect([conta.totalAupus, conta.totalGeral]).toEqual([0, 5000]);
  });

  it('frete, deslocamento, diárias e custos adicionais entram no custo dos serviços; a linha desativada, não', () => {
    const conta = contaDaProposta(
      entrada({
        logistica: [
          { tabela: 'FRETE', ativo: true, km: 120, quantidade: 2, valor_km: 2.5, valor_fixo: 80 },
          { tabela: 'DESLOCAMENTO', ativo: true, dias: 3, valor_unitario: 200, km: 240, valor_km: 2 },
          { tabela: 'DIARIA', ativo: true, quantidade: 6, valor_unitario: 45 },
          { tabela: 'DIARIA', ativo: false, quantidade: 4, valor_unitario: 180 },
        ],
        adicionais: [{ valor: 150, faturamento_direto: false }],
      }),
    );
    expect(conta).toMatchObject({ custoInstrucoes: 10000, custoLogistica: 680 + 1080 + 270, custoAdicionais: 150, custoServicos: 12180 });
  });

  it('o preço de venda de cada linha soma o preço dos serviços (o resto dos centavos vai para a maior)', () => {
    const conta = contaDaProposta(entrada({ instrucoes: [333.33, 333.33, 333.34], adicionais: [{ valor: 0.01, faturamento_direto: false }] }));
    const soma = [...conta.venda.instrucoes, conta.venda.logistica, conta.venda.adicionais].reduce((s, v) => s + v, 0);
    expect(Math.round(soma * 100) / 100).toBe(conta.precoServicos);
  });

  it('imposto e margem com 100% ou mais é 400: a divisão não fecha', () => {
    expect(() => contaDaProposta(entrada({ percentuais: { ...percentuais, imposto: 40, margem: 60 } }))).toThrow(BadRequestException);
  });

  it('o total de cada linha de logística pela tabela dela', () => {
    expect(totalDaLinha({ tabela: 'FRETE', km: 120, quantidade: 2, valor_km: 2.5, valor_fixo: 80 })).toBe(680);
    expect(totalDaLinha({ tabela: 'DESLOCAMENTO', dias: 3, valor_unitario: 200, km: 240, valor_km: 2 })).toBe(1080);
    // Os veículos (30/out/2026): vazio é um (a linha de antes), dois dobram, zero zera
    expect(totalDaLinha({ tabela: 'DESLOCAMENTO', quantidade: 2, dias: 3, valor_unitario: 200, km: 240, valor_km: 2 })).toBe(2160);
    expect(totalDaLinha({ tabela: 'DESLOCAMENTO', quantidade: 0, km: 240, valor_km: 2 })).toBe(0);
    expect(totalDaLinha({ tabela: 'DIARIA', quantidade: 6, valor_unitario: 45 })).toBe(270);
    // Campo vazio é zero (a linha ainda sendo preenchida)
    expect(totalDaLinha({ tabela: 'FRETE', km: 100 })).toBe(0);
  });
});

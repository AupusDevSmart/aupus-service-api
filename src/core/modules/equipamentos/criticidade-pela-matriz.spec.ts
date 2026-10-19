import { BadRequestException } from '@nestjs/common';
import { conferirCriticidade, criticidadeSugerida, MATRIZ_DE_CRITICIDADE } from './criticidade-pela-matriz';

describe('criticidade pela matriz (SN-64)', () => {
  // A mesma tabela está no teste do front: mudar aqui é mudar lá
  it('a matriz é a regra decidida: (2 × impacto + probabilidade) ÷ 3, arredondado', () => {
    expect(MATRIZ_DE_CRITICIDADE).toEqual([
      [1, 1, 2, 2, 2],
      [2, 2, 2, 3, 3],
      [2, 3, 3, 3, 4],
      [3, 3, 4, 4, 4],
      [4, 4, 4, 5, 5],
    ]);
    for (let i = 1; i <= 5; i++) {
      for (let p = 1; p <= 5; p++) expect(criticidadeSugerida(i, p)).toBe(Math.round((2 * i + p) / 3));
    }
  });

  it('o impacto pesa mais: rara que para a usina é Alta, frequente sem efeito é Baixa', () => {
    expect(criticidadeSugerida(5, 1)).toBe(4);
    expect(criticidadeSugerida(1, 5)).toBe(2);
  });

  it('sem as duas notas não há sugestão', () => {
    expect(criticidadeSugerida(null, 3)).toBeNull();
    expect(criticidadeSugerida(3, undefined)).toBeNull();
    expect(criticidadeSugerida(0, 3)).toBeNull();
  });

  describe('conferirCriticidade', () => {
    const erro = (atual: object, mudanca: object) => {
      try {
        conferirCriticidade(atual, mudanca);
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        return (e as BadRequestException).message;
      }
      throw new Error('deveria recusar');
    };

    it('nada dos quatro campos mudou: não confere (dado antigo não trava outro campo)', () => {
      expect(conferirCriticidade({ criticidade: 'A' }, {})).toEqual({});
      // O formulário reenvia os quatro como estão; o NexOn trocou o nível de um avaliado
      expect(
        conferirCriticidade(
          { criticidade: '5', criticidade_impacto: 1, criticidade_probabilidade: 1, criticidade_motivo: null },
          { criticidade: '5', criticidade_impacto: 1, criticidade_probabilidade: 1, criticidade_motivo: '' },
        ),
      ).toEqual({});
    });

    it('nível igual ao sugerido grava sem motivo, e um motivo velho sai', () => {
      expect(conferirCriticidade({}, { criticidade: '4', criticidade_impacto: 5, criticidade_probabilidade: 1 })).toEqual({
        criticidade_motivo: null,
      });
      expect(
        conferirCriticidade(
          { criticidade: '5', criticidade_impacto: 5, criticidade_probabilidade: 1, criticidade_motivo: 'para a usina' },
          { criticidade: '4' },
        ),
      ).toEqual({ criticidade_motivo: null });
    });

    it('nível diferente do sugerido exige o motivo', () => {
      expect(erro({}, { criticidade: '5', criticidade_impacto: 5, criticidade_probabilidade: 1 })).toBe(
        'A matriz sugere 4 (Alta) para impacto 5 e probabilidade 1. Para gravar 5, informe o motivo.',
      );
      expect(erro({}, { criticidade: '5', criticidade_impacto: 5, criticidade_probabilidade: 1, criticidade_motivo: '   ' })).toMatch(
        /informe o motivo/,
      );
      expect(
        conferirCriticidade({}, { criticidade: '5', criticidade_impacto: 5, criticidade_probabilidade: 1, criticidade_motivo: ' Único da usina ' }),
      ).toEqual({ criticidade_motivo: 'Único da usina' });
    });

    // A conta é sobre o resultado: o PATCH parcial também passa por ela
    it('trocar só o nível de um equipamento avaliado também pede o motivo', () => {
      expect(erro({ criticidade: '3', criticidade_impacto: 3, criticidade_probabilidade: 3 }, { criticidade: '5' })).toMatch(
        /A matriz sugere 3 \(Média\)/,
      );
    });

    it('trocar só uma nota recalcula a sugestão com a outra gravada', () => {
      expect(erro({ criticidade: '3', criticidade_impacto: 3, criticidade_probabilidade: 3 }, { criticidade_impacto: 5 })).toMatch(
        /A matriz sugere 4 \(Alta\) para impacto 5 e probabilidade 3\. Para gravar 3/,
      );
    });

    it('impacto e probabilidade vão juntos', () => {
      expect(erro({}, { criticidade: '3', criticidade_impacto: 3 })).toBe('Informe o impacto e a probabilidade juntos, ou nenhum dos dois.');
      expect(erro({ criticidade: '3', criticidade_impacto: 3, criticidade_probabilidade: 3 }, { criticidade_probabilidade: null })).toMatch(/juntos/);
      expect(
        conferirCriticidade({ criticidade: '3', criticidade_impacto: 3, criticidade_probabilidade: 3 }, { criticidade_impacto: null, criticidade_probabilidade: null }),
      ).toEqual({ criticidade_motivo: null });
    });

    // O lote de componentes não passa pelo pipe do DTO
    it('nota e nível fora da escala são recusados', () => {
      expect(erro({}, { criticidade: '3', criticidade_impacto: 6, criticidade_probabilidade: 1 })).toBe('O impacto da falha vai de 1 a 5.');
      expect(erro({}, { criticidade: '3', criticidade_impacto: 2, criticidade_probabilidade: 2.5 })).toBe('A probabilidade de falha vai de 1 a 5.');
      expect(erro({}, { criticidade: 'X' })).toBe('A criticidade vai de 1 a 5.');
      // Chave herdada do objeto não é nível (passava e virava 500 no VarChar(1))
      expect(erro({}, { criticidade: 'constructor' })).toBe('A criticidade vai de 1 a 5.');
      expect(erro({}, { criticidade: 3 as never })).toBe('A criticidade vai de 1 a 5.');
      expect(erro({ criticidade: '3' }, { criticidade: null })).toBe('A criticidade vai de 1 a 5.');
      expect(erro({}, { criticidade: '3', criticidade_motivo: 'x'.repeat(1001) })).toMatch(/no máximo 1000/);
    });

    it('o nível antigo (A/B/C) que não mudou não é recusado por estar fora da escala', () => {
      expect(conferirCriticidade({ criticidade: 'A' }, { criticidade: 'A', criticidade_motivo: null })).toEqual({});
      expect(conferirCriticidade({ criticidade: 'A' }, { criticidade: 'A', criticidade_motivo: 'x' })).toEqual({ criticidade_motivo: null });
    });

    it('sem avaliação o motivo não se guarda: ele é o da diferença', () => {
      expect(conferirCriticidade({}, { criticidade: '5', criticidade_motivo: 'porque sim' })).toEqual({ criticidade_motivo: null });
    });
  });
});

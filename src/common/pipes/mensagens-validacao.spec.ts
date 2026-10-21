import { IsOptional, Max, Min } from 'class-validator';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { exceptionFactoryEmPortugues } from './mensagens-validacao';

class Limites {
  @IsOptional()
  @Max(10)
  padrao?: number;

  @IsOptional()
  @Min(1, { message: 'Comece em um.' })
  @Max(5, { message: 'Ninguém passa de cinco.' })
  escrita?: number;
}

/**
 * A tradução do class-validator para português (SN-85). A frase escrita no DTO
 * sem o limite dentro virava "no máximo undefined": o número da tradução sai do
 * texto original, e a frase de quem escreveu o DTO não tem número.
 */
describe('mensagens de validação em português', () => {
  const pipe = new ValidationPipe({ transform: true, exceptionFactory: exceptionFactoryEmPortugues });
  const frases = async (dados: Record<string, unknown>) => {
    try {
      await pipe.transform(dados, { type: 'body', metatype: Limites });
    } catch (erro) {
      return ((erro as BadRequestException).getResponse() as { message: string[] }).message;
    }
    throw new Error('o pipe aceitou');
  };

  it('o limite padrão sai traduzido, com o número', async () => {
    expect(await frases({ padrao: 11 })).toEqual(['padrao deve ser no máximo 10.']);
  });

  it('a frase escrita no DTO sem número fica como foi escrita (nunca "no máximo undefined")', async () => {
    expect(await frases({ escrita: 9 })).toEqual(['Ninguém passa de cinco.']);
    expect(await frases({ escrita: 0 })).toEqual(['Comece em um.']);
  });
});

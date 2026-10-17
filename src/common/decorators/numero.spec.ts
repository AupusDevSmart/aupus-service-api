import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsNumber, IsOptional } from 'class-validator';
import { exceptionFactoryEmPortugues } from '../pipes/mensagens-validacao';
import { AtualizarChecklistDto } from '../../modules/execucao-os/dto/os-actions.dto';
import { CreateSubInstrucaoDto } from '../../modules/instrucoes/dto/create-sub-instrucao.dto';
import { CasasDecimais, VazioEhNulo } from './numero';

class Preco {
  @IsOptional()
  @IsNumber()
  @CasasDecimais(2)
  @VazioEhNulo()
  valor?: number | null;
}

/**
 * Número na API (revisão do SN-58), com o pipe do configurar-app. O
 * `maxDecimalPlaces` do IsNumber lia as casas pelo texto: "1e-7" (sem ponto)
 * lançava TypeError e o 400 virava 500. E a conversão implícita do pipe fazia
 * "" virar 0 e true virar 1.
 */
describe('CasasDecimais e VazioEhNulo', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: exceptionFactoryEmPortugues,
  });
  const corpo = <T>(metatype: new () => T, dados: unknown) => pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;
  const frases = async (metatype: new () => unknown, dados: unknown) => {
    try {
      await corpo(metatype, dados);
    } catch (erro) {
      expect(erro).toBeInstanceOf(BadRequestException);
      return ((erro as BadRequestException).getResponse() as { message: string[] }).message.join(' | ');
    }
    throw new Error('o pipe aceitou');
  };

  it.each([[12.5], [12.34], [0], [-3], [1e10]])('aceita %s com até 2 casas', async (valor) => {
    expect((await corpo(Preco, { valor })).valor).toBe(valor);
  });

  it.each([[1e-7], [1.5e-7], [12.345], [0.001]])('recusa %s com 400, não 500', async (valor) => {
    expect(await frases(Preco, { valor })).toContain('no máximo 2 casas decimais');
  });

  it('texto vazio é null; booleano é recusado', async () => {
    expect((await corpo(Preco, { valor: '' })).valor).toBeNull();
    expect((await corpo(Preco, { valor: '  ' })).valor).toBeNull();
    expect(await frases(Preco, { valor: true })).not.toBe('');
  });

  it('a leitura do checklist: 4 casas, notação científica é 400, "" apaga', async () => {
    expect(await frases(AtualizarChecklistDto, { atividades: [{ id: 'x', valor_lido: 1e-7 }] })).toContain('4 casas');
    expect(await frases(AtualizarChecklistDto, { atividades: [{ id: 'x', valor_lido: false }] })).not.toBe('');

    const dto = await corpo(AtualizarChecklistDto, { atividades: [{ id: 'x', valor_lido: '' }, { id: 'y', valor_lido: 601.2345 }] });
    expect(dto.atividades.map((a) => a.valor_lido)).toEqual([null, 601.2345]);
  });

  it('a observação do item tem limite e o lote tem teto', async () => {
    expect(await frases(AtualizarChecklistDto, { atividades: [{ id: 'x', observacoes: 'a'.repeat(2001) }] })).toContain('observacoes');
    const muitos = Array.from({ length: 501 }, (_, i) => ({ id: `i${i}`, concluida: true }));
    expect(await frases(AtualizarChecklistDto, { atividades: muitos })).not.toBe('');
  });

  it('a faixa do passo: "" é sem limite', async () => {
    const passo = await corpo(CreateSubInstrucaoDto, { descricao: 'Tensão', tipo: 'LEITURA', valor_minimo: '', valor_maximo: 620 });
    expect([passo.valor_minimo, passo.valor_maximo]).toEqual([null, 620]);
  });
});

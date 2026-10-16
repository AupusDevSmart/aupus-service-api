import { normalizarEmail, telefoneE164 } from './contato';

/**
 * Telefone num formato só (E.164, `+5562999998888`) e e-mail sem caixa
 * (SN-46). No dev havia 12 formatos para 55 telefones — com e sem máscara, com
 * e sem +55, e texto que nem é telefone — e nenhum servia para avisar alguém
 * (a Fase 2 deixa o WhatsApp preparado por este número).
 */
describe('telefoneE164', () => {
  it.each([
    ['62999998888', '+5562999998888'],
    ['(62) 99999-8888', '+5562999998888'],
    ['62 99999-8888 ', '+5562999998888'],
    ['5562999998888', '+5562999998888'],
    ['+55 62 99999-8888', '+5562999998888'],
    ['062999998888', '+5562999998888'],
    ['6233334444', '+556233334444'],
    ['(62) 3333-4444', '+556233334444'],
    ['+1 415 555 2671', '+14155552671'],
    ['0014155552671', '+14155552671'],
  ])('%s vira %s', (entrada, esperado) => {
    expect(telefoneE164(entrada)).toBe(esperado);
  });

  it.each([
    ['texto', 'werwe'],
    ['curto demais', '9999'],
    ['8 dígitos sem DDD', '99998888'],
    ['DDD começando em 0', '0299998888'],
    ['celular de 11 dígitos sem o 9', '62899998888'],
    ['celular com um dígito a menos (fixo começa de 2 a 5)', '(62) 9999-9888'],
    ['fixo começando em 1', '6213334444'],
    ['+55 com dígitos de menos', '+55629999'],
    ['internacional longo demais', '+1234567890123456'],
  ])('%s é inválido', (_caso, entrada) => {
    expect(telefoneE164(entrada)).toBeNull();
  });
});

describe('normalizarEmail', () => {
  it('apara e põe em minúsculas', () => {
    expect(normalizarEmail('  Ana.Souza@Empresa.COM.br ')).toBe('ana.souza@empresa.com.br');
  });

  it('o que não é texto passa como veio (o validador recusa)', () => {
    expect(normalizarEmail(undefined)).toBeUndefined();
    expect(normalizarEmail(42)).toBe(42);
  });
});

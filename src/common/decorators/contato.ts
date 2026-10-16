import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, Matches } from 'class-validator';
import { normalizarEmail, telefoneE164 } from '../helpers/contato';

/** Telefone no formato E.164: `+` e de 8 a 15 dígitos. */
export const FORMATO_E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Telefone opcional, gravado em E.164 (SN-46). O que a pessoa digitou com
 * máscara vira `+5562999998888`; vazio vira `null` (sem telefone); o que não é
 * telefone fica como veio para o validador recusar com a mensagem abaixo.
 */
export function TelefoneE164(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (value === undefined || value === null) return value;
      const texto = String(value);
      if (!texto.trim()) return null;
      return telefoneE164(texto) ?? texto;
    }),
    IsOptional(),
    Matches(FORMATO_E164, { message: 'Telefone inválido: informe o DDD e o número, como (62) 99999-8888' }),
  );
}

/** E-mail aparado e em minúsculas antes de validar e gravar: é o login (SN-46). */
export function EmailNormalizado(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => normalizarEmail(value));
}

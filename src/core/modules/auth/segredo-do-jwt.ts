import type { ConfigService } from '@nestjs/config';

/**
 * O segredo que assina os tokens. Sem ele a API não sobe: antes havia um
 * segredo fixo no código como alternativa, e com ele qualquer pessoa assinaria
 * um token de super_admin.
 */
export function segredoDoJwt(config: ConfigService): string {
  const segredo = config.get<string>('JWT_SECRET');
  if (!segredo) throw new Error('JWT_SECRET não configurado: a API não sobe sem o segredo dos tokens.');
  return segredo;
}

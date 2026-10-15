import { ThrottlerModule } from '@nestjs/throttler';
// Não sai no índice do pacote; é a mesma normalização do contador por IP.
// O spec "IPv6 do mesmo /64" quebra se uma versão nova a mudar de lugar.
import { normalizeIp } from '@nestjs/throttler/dist/ip';

/**
 * Limite de tentativas nas rotas que conferem senha ou disparam e-mail
 * (SN-38): sem ele, login e "esqueci a senha" aceitavam tentativas sem fim —
 * força bruta de senha e abuso do envio de e-mail.
 *
 * Contadores:
 * - `conta` (IP + e-mail): força bruta numa conta;
 * - `ip`: quem tenta várias contas. Folgado de propósito, porque um escritório
 *   inteiro sai pelo mesmo IP;
 * - `email` (só o e-mail): só no "esqueci a senha", onde cada pedido mata o link
 *   anterior. No login e na redefinição fica de fora (`SEM_CONTADOR_DE_EMAIL`):
 *   contar só pelo e-mail deixaria qualquer um, de qualquer IP, trancar a conta
 *   de outra pessoa.
 *
 * O IP é o `req.ip`, que o `trust proxy` do `configurarApp` resolve pelo
 * X-Forwarded-For só quando a conexão vem do nginx da própria máquina — e o
 * nginx tem de sobrescrever esse cabeçalho (roteiro do deploy, item 5c). IPv6
 * conta pelo /64, como o contador por IP. Contador em memória, por instância.
 * Os cabeçalhos de contagem não saem: diriam ao atacante quantas sobram.
 */
const MINUTO = 60_000;

const ipNormalizado = (req: Record<string, unknown>) => normalizeIp(String(req.ip));

const emailDoCorpo = (req: Record<string, unknown>) =>
  String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();

export const LimiteDeTentativasModule = ThrottlerModule.forRoot({
  errorMessage: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  setHeaders: false,
  throttlers: [
    { name: 'conta', ttl: MINUTO, limit: 6, getTracker: (req) => `${ipNormalizado(req)}|${emailDoCorpo(req)}` },
    { name: 'ip', ttl: MINUTO, limit: 30 },
    { name: 'email', ttl: 60 * MINUTO, limit: 5, getTracker: emailDoCorpo },
  ],
});

/** Para o `@SkipThrottle` das rotas em que contar só pelo e-mail trancaria a conta alheia. */
export const SEM_CONTADOR_DE_EMAIL = { email: true };

/** Login: 6 por minuto por conta, como o `throttle:6,1` do AupusProject. */
export const LIMITE_DO_LOGIN = { conta: { limit: 6, ttl: MINUTO }, ip: { limit: 30, ttl: MINUTO } };

/** "Esqueci a senha" manda e-mail: 3 a cada 10 minutos por conta, 5 por hora pelo e-mail. */
export const LIMITE_DO_ESQUECI_A_SENHA = {
  conta: { limit: 3, ttl: 10 * MINUTO },
  ip: { limit: 10, ttl: 10 * MINUTO },
  email: { limit: 5, ttl: 60 * MINUTO },
};

/** Redefinir com o token do e-mail: 5 a cada 10 minutos por conta. */
export const LIMITE_DA_REDEFINICAO = { conta: { limit: 5, ttl: 10 * MINUTO }, ip: { limit: 10, ttl: 10 * MINUTO } };

/**
 * Trocar a senha logado confere a senha atual: 5 a cada 10 minutos pela conta
 * da rota, de qualquer IP — com um token roubado, sem limite, dava para
 * descobrir a senha e usá-la onde ela se repete.
 */
export const LIMITE_DA_TROCA_DE_SENHA = {
  conta: {
    limit: 5,
    ttl: 10 * MINUTO,
    getTracker: (req: Record<string, unknown>) => `troca|${String((req.params as { id?: unknown } | undefined)?.id ?? '').trim()}`,
  },
  ip: { limit: 30, ttl: 10 * MINUTO },
};

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

/**
 * Renovar o token: o front chama sozinho (uma vez por hora por aba), então o
 * teto é folgado e só por IP — o corpo não tem e-mail. Sem nenhum, a rota
 * pública aceitava pedidos sem fim (revisão do SN-50).
 */
export const LIMITE_DA_RENOVACAO = { ip: { limit: 120, ttl: MINUTO } };
/** Na renovação só conta o IP. */
export const SO_O_IP = { conta: true, email: true };

/**
 * Chamados do NexON (integração de serviço): o worker de lá manda até 80 por
 * minuto. O teto segura token errado em sequência e o laço que encheria o
 * sininho e o e-mail de quem programa; conta só o IP (revisão de segurança da
 * integração, 22/out/2026).
 */
export const LIMITE_DOS_CHAMADOS_DO_NEXON = { ip: { limit: 120, ttl: MINUTO } };

/**
 * Comentar (SN-48): cada comentário avisa os envolvidos e quem programa. 20
 * por minuto por conta é folga para conversa e trava o laço que encheria o
 * sininho (e o e-mail) da equipe.
 */
export const LIMITE_DE_COMENTARIOS = {
  conta: {
    limit: 20,
    ttl: MINUTO,
    getTracker: (req: Record<string, unknown>) => `comentario|${String((req.user as { id?: unknown } | undefined)?.id ?? '').trim()}`,
  },
  ip: { limit: 120, ttl: MINUTO },
};

/**
 * O PDF e a conferência do código da OS (SN-62): cada pedido relê a OS inteira
 * e a conferência soma os arquivos do disco. 10 por minuto por pessoa é folga
 * para quem baixa e confere, e trava o laço que pesaria no disco de todos.
 */
export const LIMITE_DO_PDF_DA_OS = {
  conta: {
    limit: 10,
    ttl: MINUTO,
    getTracker: (req: Record<string, unknown>) => `pdf-da-os|${String((req.user as { id?: unknown } | undefined)?.id ?? '').trim()}`,
  },
  ip: { limit: 60, ttl: MINUTO },
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

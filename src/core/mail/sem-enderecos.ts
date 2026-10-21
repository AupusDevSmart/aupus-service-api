/**
 * O log não leva endereço de e-mail (LGPD: minimização). O motivo do SMTP
 * costuma trazer o endereço ("550 <fulano@...> rejected"), e o "enviado para
 * <endereço>" de cada boas-vindas e de cada "esqueci a senha" deixava no log do
 * PM2 a lista de quem usa o sistema (achado do SN-89).
 */
export const semEnderecos = (texto: string) => texto.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<e-mail>');

/** Escapa o texto que vem de cadastro (título, descrição) antes de entrar no HTML. */
function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Desarma endereço digitado no texto ("revalide em https://aupus-login.exemplo"):
 * o Gmail e o Outlook transformam em link clicável qualquer URL ou domínio,
 * mesmo escapado, e o e-mail sai do remetente da Aupus — phishing de graça para
 * quem abre uma solicitação. "https://x.com" vira "https[:]//x[.]com".
 */
export function semLinksClicaveis(texto: string): string {
  return texto
    .replace(/:\/\//g, '[:]//')
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, (dominio) => dominio.replace(/\./g, '[.]'));
}

/**
 * E-mail de uma notificação (SN-47): o mesmo cabeçalho dos outros e-mails da
 * Aupus, o título, uma linha do que é e o botão que abre o registro. O texto
 * vem de dado digitado (descrição da OS, da anomalia): tudo escapado, e os
 * endereços do texto desarmados (o único link é o botão).
 */
export function getNotificacaoEmailHtml(titulo: string, descricao: string, url: string | null, frontendUrl: string): string {
  const logoUrl = `${frontendUrl}/logoaupus.png`;
  const botao = url
    ? `<p style="margin: 24px 0 0;"><a href="${escapar(url)}" style="display: inline-block; background-color: #1a1a2e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Abrir no Aupus Service</a></p>`
    : '';
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapar(titulo)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7; padding: 40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%;">
          <tr>
            <td style="background-color: #1a1a2e; padding: 32px 40px; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="${logoUrl}" alt="Aupus" height="40" style="display: inline-block;">
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 32px 40px; border-radius: 0 0 8px 8px;">
              <h1 style="margin: 0 0 12px; font-size: 18px; color: #1a1a2e;">${escapar(semLinksClicaveis(titulo))}</h1>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4a4a68;">${escapar(semLinksClicaveis(descricao))}</p>
              ${botao}
              <p style="margin: 32px 0 0; font-size: 12px; color: #8a8aa3;">Você recebe este aviso pelas suas preferências de notificação no Aupus Service (Perfil).</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

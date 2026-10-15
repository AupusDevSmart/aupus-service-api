const EXTENSAO_DO_TIPO: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/**
 * A extensão da imagem enviada pelo tipo que o filtro do upload aceitou, nunca
 * pelo nome que o cliente mandou: "x.html" declarado como image/png era
 * gravado como .html e servido como text/html pela rota pública de uploads
 * (revisão de segurança do SN-38). Tipo fora da lista vira `.bin`.
 */
export function extensaoDaImagem(tipo: string): string {
  return EXTENSAO_DO_TIPO[tipo.toLowerCase()] ?? '.bin';
}

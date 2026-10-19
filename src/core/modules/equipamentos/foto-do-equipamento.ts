import { BadRequestException } from '@nestjs/common';
import { promises as arquivos } from 'fs';
import * as caminho from 'path';
import type { Prisma } from '@prisma/client';

/**
 * A foto do equipamento no disco (achados da revisão do SN-75).
 *
 * - `foto_url` vinha de qualquer gravação (POST, PATCH, lote, lote de
 *   componentes) como texto livre, e trocar ou remover a foto fazia
 *   `unlink(cwd + foto_url)`: um `"foto_url": "dist/main.js"` seguido de
 *   "remover foto" apagava o arquivo do servidor. Agora só se grava o caminho
 *   que o upload gera, e só se apaga dentro da pasta das fotos.
 * - O cadastro em lote replica a mesma foto em N equipamentos (SN-36): remover
 *   a de um apagava o arquivo dos outros. O arquivo só sai quando ninguém mais
 *   aponta para ele, como os anexos.
 */
export const PASTA_DAS_FOTOS = '/uploads/equipamentos/';
const FOTO_DO_UPLOAD = /^\/uploads\/equipamentos\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export const ehFotoDoUpload = (valor: unknown): valor is string => typeof valor === 'string' && FOTO_DO_UPLOAD.test(valor);

/**
 * Recusa a `foto_url` que não é a de um upload. A que já está gravada passa
 * (dado de antes, num formato antigo, não trava salvar outro campo).
 */
export function conferirFoto(gravada: string | null | undefined, nova: unknown): void {
  if (nova === undefined || nova === null || nova === '' || nova === gravada) return;
  if (!ehFotoDoUpload(nova)) {
    throw new BadRequestException('foto_url inválida: a foto se envia pela rota de upload do equipamento.');
  }
}

/** Apaga o arquivo da foto se ninguém mais (nem excluído) aponta para ele. Nunca fora da pasta. */
export async function apagarFotoSemUso(
  prisma: Pick<Prisma.TransactionClient, 'equipamentos'>,
  fotoUrl: string | null | undefined,
  equipamentoId: string,
): Promise<void> {
  if (!ehFotoDoUpload(fotoUrl)) return;
  const outros = await prisma.equipamentos.count({ where: { foto_url: fotoUrl, NOT: { id: equipamentoId } } });
  if (outros > 0) return;

  const pasta = caminho.resolve(process.cwd(), 'uploads', 'equipamentos');
  const arquivo = caminho.resolve(pasta, caminho.basename(fotoUrl));
  if (caminho.dirname(arquivo) !== pasta) return;
  // Arquivo que já não existe não impede trocar nem remover a foto
  await arquivos.unlink(arquivo).catch(() => undefined);
}

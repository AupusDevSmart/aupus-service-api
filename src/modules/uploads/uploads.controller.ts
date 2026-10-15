import { Controller, Get, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { basename, resolve, sep } from 'path';
import { existsSync, statSync } from 'fs';
import { ApiOperation, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@/core';

/**
 * O arquivo pedido, só se estiver DENTRO de `uploads/<pasta>`; senão null.
 *
 * Antes o nome ia direto para `join(cwd, 'uploads', pasta, nome)`: com
 * `..%2F..%2F` no nome, a rota (pública, sem login) servia qualquer arquivo do
 * servidor — package.json, configuração, o dump em backups/ (SN-40). Nome com
 * barra, `..` ou que resolve para fora da pasta: 404, igual a arquivo que não existe.
 */
export function arquivoDaPasta(pasta: string, nome: string): string | null {
  if (!nome || nome !== basename(nome) || nome === '.' || nome === '..') return null;
  const raiz = resolve(process.cwd(), 'uploads', pasta);
  const alvo = resolve(raiz, nome);
  if (!alvo.startsWith(raiz + sep)) return null;
  if (!existsSync(alvo) || !statSync(alvo).isFile()) return null;
  return alvo;
}

@Public() // Rotas públicas (sem autenticação): a tela mostra a foto em <img>, sem token
@ApiExcludeController() // Não incluir no Swagger
@Controller('uploads')
export class UploadsController {
  private servir(pasta: string, nome: string, res: Response) {
    const arquivo = arquivoDaPasta(pasta, nome);
    // Sem o caminho na resposta: ele contava ao visitante onde o servidor guarda os arquivos
    if (!arquivo) return res.status(HttpStatus.NOT_FOUND).json({ message: 'File not found' });
    // Nada do que é servido aqui roda: HTML enviado como "imagem" virava página
    // com script na origem da API (SN-38). Não afeta a <img> da tela.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.sendFile(arquivo);
  }

  @Get('avatars/:filename')
  @ApiOperation({ summary: 'Serve avatar image' })
  @ApiResponse({ status: 200, description: 'Image file' })
  @ApiResponse({ status: 404, description: 'File not found' })
  serveAvatar(@Param('filename') filename: string, @Res() res: Response) {
    return this.servir('avatars', filename, res);
  }

  @Get('tarefas/:filename')
  @ApiOperation({ summary: 'Serve task attachment' })
  @ApiResponse({ status: 200, description: 'File' })
  @ApiResponse({ status: 404, description: 'File not found' })
  serveTaskFile(@Param('filename') filename: string, @Res() res: Response) {
    return this.servir('tarefas', filename, res);
  }

  @Get('equipamentos/:filename')
  @ApiOperation({ summary: 'Serve equipamento photo' })
  @ApiResponse({ status: 200, description: 'Image file' })
  @ApiResponse({ status: 404, description: 'File not found' })
  serveEquipamentoPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.servir('equipamentos', filename, res);
  }
}

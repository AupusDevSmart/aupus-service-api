import { BadRequestException } from '@nestjs/common';
import { promises as arquivos } from 'fs';
import * as caminho from 'path';
import { apagarFotoSemUso, conferirFoto } from './foto-do-equipamento';

/** A foto do equipamento no disco (revisão do SN-75). */
describe('foto do equipamento', () => {
  describe('conferirFoto', () => {
    it('aceita o caminho que o upload gera e a foto que já estava gravada', () => {
      expect(() => conferirFoto(null, '/uploads/equipamentos/foto-1786636783217-931412428.jpg')).not.toThrow();
      expect(() => conferirFoto('fotos/antiga.jpg', 'fotos/antiga.jpg')).not.toThrow();
      expect(() => conferirFoto('/uploads/equipamentos/a.jpg', null)).not.toThrow();
    });

    it.each(['dist/main.js', '.env', '../aupus-nexon-api/.env', '/uploads/equipamentos/../../.env', '/uploads/equipamentos/..', '/uploads/anexos/x.pdf'])(
      'recusa %s',
      (url) => {
        expect(() => conferirFoto(null, url)).toThrow(BadRequestException);
      },
    );
  });

  describe('apagarFotoSemUso', () => {
    const unlink = jest.spyOn(arquivos, 'unlink').mockResolvedValue(undefined);
    const pasta = caminho.resolve(process.cwd(), 'uploads', 'equipamentos');
    const comOutros = (n: number) => ({ equipamentos: { count: jest.fn().mockResolvedValue(n) } }) as never;

    beforeEach(() => unlink.mockClear());

    it('apaga a foto que só este equipamento usa', async () => {
      await apagarFotoSemUso(comOutros(0), '/uploads/equipamentos/foto-1.jpg', 'e1');
      expect(unlink).toHaveBeenCalledWith(caminho.join(pasta, 'foto-1.jpg'));
    });

    // O cadastro em lote replica a foto: remover a de um apagava a dos outros
    it('não apaga a foto que outro equipamento ainda usa', async () => {
      await apagarFotoSemUso(comOutros(5), '/uploads/equipamentos/foto-1.jpg', 'e1');
      expect(unlink).not.toHaveBeenCalled();
    });

    it('nunca apaga fora da pasta das fotos', async () => {
      for (const url of ['dist/main.js', '/uploads/equipamentos/../../.env', null]) await apagarFotoSemUso(comOutros(0), url, 'e1');
      expect(unlink).not.toHaveBeenCalled();
    });

    it('arquivo que já não existe não impede', async () => {
      unlink.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      await expect(apagarFotoSemUso(comOutros(0), '/uploads/equipamentos/sumiu.jpg', 'e1')).resolves.toBeUndefined();
    });
  });
});

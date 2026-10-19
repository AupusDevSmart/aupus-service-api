import { Injectable } from '@nestjs/common';
import { feriados, PermissionScopeService, PrismaService } from '@/core';
import { FeriadosService } from '@/modules/agenda/feriados.service';
import { CreateFeriadoDto } from '@/modules/agenda/dto/create-feriado.dto';
import { UpdateFeriadoDto } from '@/modules/agenda/dto/update-feriado.dto';
import { CadastroImportavel, ErrosDaLinha, UsuarioDaImportacao } from '../importacao.types';
import { CatalogoPorNome, listaDaCelula } from '../catalogo-por-nome';
import { AGENDA_DA_AUPUS } from '@/modules/agenda/agenda-da-aupus';

/**
 * Feriados: cadastro plano. As plantas de um feriado que não é geral vão numa
 * célula só, pelo nome e separadas por ";", com os IDs ao lado (em outra
 * célula, na mesma ordem) para resolver nome repetido.
 */
@Injectable()
export class FeriadosImportacao implements CadastroImportavel<feriados> {
  readonly singular = 'feriado';
  readonly dtoDeCriacao = CreateFeriadoDto;
  readonly dtoDeEdicao = UpdateFeriadoDto;

  constructor(
    private readonly feriados: FeriadosService,
    private readonly escopo: PermissionScopeService,
    private readonly prisma: PrismaService,
  ) {}

  async buscar(id: string) {
    await this.feriados.buscarPorId(id);
    return this.prisma.feriados.findUniqueOrThrow({ where: { id } });
  }

  /** `plantas` (nomes) + `plantas_ids` (os IDs exportados) → `plantaIds`. */
  /** Cliente e técnico não alteram a agenda, como na tela (SN-76) */
  async autorizar(usuario: UsuarioDaImportacao) {
    if (this.escopo.isScoped(await this.escopo.getScope(usuario))) throw ErrosDaLinha.em('nome', AGENDA_DA_AUPUS);
  }

  async prepararDados(dados: Record<string, unknown>, usuario: UsuarioDaImportacao, atual: feriados | null) {
    const { plantas, plantas_ids, ...resto } = dados;
    if (plantas === undefined) return resto;

    const nomes = listaDaCelula(plantas);
    if (resto.geral === true || nomes.length === 0) return resto;

    const catalogo = await this.catalogoDePlantas(usuario, atual);
    const idsDaLinha = listaDaCelula(plantas_ids);
    const plantaIds: string[] = [];

    for (const nome of nomes) {
      const achado = catalogo.procurar(nome, idsDaLinha);
      if (typeof achado !== 'string') throw ErrosDaLinha.em('plantas', achado.erro);
      plantaIds.push(achado);
    }

    return { ...resto, plantaIds };
  }

  /**
   * As plantas que quem importa enxerga — a mesma lista do seletor da tela —
   * e as que o feriado já tem. Estas entram mesmo excluídas: o vínculo existe,
   * a exportação o mostra, e reimportar sem mexer não pode dar erro nem
   * desfazê-lo calado. Vínculo novo com planta excluída continua sendo erro.
   */
  private async catalogoDePlantas(usuario: UsuarioDaImportacao, atual: feriados | null) {
    const escopo = await this.escopo.getScope(usuario);
    const plantas = await this.prisma.plantas.findMany({
      where: {
        OR: [
          { deleted_at: null, ...(this.escopo.isScoped(escopo) ? { id: { in: escopo } } : {}) },
          ...(atual ? [{ feriado_plantas: { some: { feriado_id: atual.id } } }] : []),
        ],
      },
      select: { id: true, nome: true },
    });
    return new CatalogoPorNome(plantas, 'planta', 'f');
  }

  async criar(dto: object) {
    return this.feriados.criar(dto as CreateFeriadoDto);
  }

  atualizar(atual: feriados, dto: object) {
    return this.feriados.atualizar(atual.id, dto as UpdateFeriadoDto);
  }

  async retrato(id: string) {
    const f = await this.prisma.feriados.findUniqueOrThrow({
      where: { id },
      include: { feriado_plantas: { select: { planta_id: true } } },
    });
    return {
      nome: f.nome,
      data: f.data.toISOString().slice(0, 10),
      tipo: f.tipo,
      geral: f.geral,
      recorrente: f.recorrente,
      descricao: f.descricao,
      plantas: f.feriado_plantas.map((p) => p.planta_id.trim()).sort(),
    };
  }

  idDe(atual: feriados) {
    return atual.id.trim();
  }

  nomeDe(atual: feriados | null, dto: object) {
    return (dto as UpdateFeriadoDto).nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: feriados) {
    return atual.updated_at;
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { planoAHerdar } from '../../../modules/planos-manutencao/heranca-de-plano';

interface CriarAtivoFuncionalDto {
  nome: string;
  categoria_id: string;
  unidade_id: string;
  localizacao?: string;
  localizacao_especifica?: string;
  observacoes?: string;
}

interface OpcoesDoVinculo {
  motivo?: string;
  usuarioId?: string;
}

/**
 * A POSICAO e o vinculo dela com o equipamento instalado.
 *
 * "Inversor 1" e uma posicao; o equipamento que esta la pode ser trocado. Tudo
 * neste service existe para que a troca nao apague o que ja passou por ali.
 */
@Injectable()
export class AtivosFuncionaisService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dto: CriarAtivoFuncionalDto) {
    return this.prisma.ativos_funcionais.create({
      data: {
        nome: dto.nome,
        categoria_id: dto.categoria_id.trim(),
        unidade_id: dto.unidade_id.trim(),
        localizacao: dto.localizacao ?? null,
        localizacao_especifica: dto.localizacao_especifica ?? null,
        observacoes: dto.observacoes ?? null,
      },
    });
  }

  /**
   * Instala um equipamento numa posicao.
   *
   * Recusa se a posicao ja tiver ocupante. A checagem existe para dar erro
   * legivel; quem garante de fato e o indice unico parcial sobre os vinculos em
   * aberto — sem ele, duas requisicoes simultaneas passariam as duas pela
   * checagem antes de qualquer uma gravar.
   */
  async instalar(ativoFuncionalId: string, equipamentoId: string, opcoes: OpcoesDoVinculo = {}) {
    const posicao = ativoFuncionalId.trim();
    const equipamento = equipamentoId.trim();

    return this.prisma.$transaction(async (tx) => {
      const alvo = await tx.ativos_funcionais.findFirst({
        where: { id: posicao, deleted_at: null },
      });
      if (!alvo) throw new NotFoundException('Ativo funcional nao encontrado');

      const ocupada = await tx.ativos_funcionais_equipamentos.findFirst({
        where: { ativo_funcional_id: posicao, removido_em: null },
      });
      if (ocupada) {
        throw new ConflictException(
          'Esta posicao ja tem um equipamento ativo. Remova ou substitua antes de instalar outro.',
        );
      }

      const vinculo = await tx.ativos_funcionais_equipamentos.create({
        data: {
          ativo_funcional_id: posicao,
          equipamento_id: equipamento,
          instalado_por_id: opcoes.usuarioId?.trim() ?? null,
        },
      });

      // `unidade_id` acompanha a posicao: e copia, nao segunda fonte da verdade.
      // As permissoes por planta atravessam equipamento -> unidade -> planta em
      // varios modulos, e sem a copia cada um deles ganharia um salto a mais.
      await tx.equipamentos.update({
        where: { id: equipamento },
        data: {
          ativo_funcional_id: posicao,
          ativo_na_posicao: true,
          unidade_id: alvo.unidade_id,
        },
      });

      return vinculo;
    });
  }

  /**
   * Remove o equipamento que estiver ativo na posicao, liberando-a.
   *
   * Fecha o vinculo com data e motivo — nao apaga. O registro do que passou por
   * ali e justamente o que a separacao posicao/equipamento existe para guardar.
   */
  async remover(ativoFuncionalId: string, opcoes: OpcoesDoVinculo = {}) {
    const posicao = ativoFuncionalId.trim();

    return this.prisma.$transaction(async (tx) => {
      const aberto = await tx.ativos_funcionais_equipamentos.findFirst({
        where: { ativo_funcional_id: posicao, removido_em: null },
      });
      if (!aberto) {
        throw new NotFoundException('Esta posicao nao tem equipamento ativo');
      }

      const fechado = await tx.ativos_funcionais_equipamentos.update({
        where: { id: aberto.id },
        data: {
          removido_em: new Date(),
          motivo_remocao: opcoes.motivo ?? null,
          removido_por_id: opcoes.usuarioId?.trim() ?? null,
        },
      });

      await tx.equipamentos.update({
        where: { id: aberto.equipamento_id },
        data: { ativo_na_posicao: false },
      });

      return fechado;
    });
  }

  /**
   * Move um equipamento de uma posicao para outra.
   *
   * Fecha o vinculo de origem e abre o de destino — nunca edita o anterior, que
   * reescreveria o passado. As duas operacoes vao na mesma transacao: se o
   * destino estiver ocupado, a origem tem de continuar exatamente como estava.
   */
  async transferir(equipamentoId: string, paraAtivoFuncionalId: string, opcoes: OpcoesDoVinculo = {}) {
    const equipamento = equipamentoId.trim();
    const destino = paraAtivoFuncionalId.trim();

    return this.prisma.$transaction(async (tx) => {
      const alvo = await tx.ativos_funcionais.findFirst({
        where: { id: destino, deleted_at: null },
      });
      if (!alvo) throw new NotFoundException('Ativo funcional de destino nao encontrado');

      const ocupado = await tx.ativos_funcionais_equipamentos.findFirst({
        where: { ativo_funcional_id: destino, removido_em: null },
      });
      if (ocupado) {
        throw new ConflictException(
          'A posicao de destino ja tem um equipamento ativo.',
        );
      }

      const aberto = await tx.ativos_funcionais_equipamentos.findFirst({
        where: { equipamento_id: equipamento, removido_em: null },
      });
      if (aberto) {
        await tx.ativos_funcionais_equipamentos.update({
          where: { id: aberto.id },
          data: {
            removido_em: new Date(),
            motivo_remocao: opcoes.motivo ?? null,
            removido_por_id: opcoes.usuarioId?.trim() ?? null,
          },
        });
      }

      const vinculo = await tx.ativos_funcionais_equipamentos.create({
        data: {
          ativo_funcional_id: destino,
          equipamento_id: equipamento,
          instalado_por_id: opcoes.usuarioId?.trim() ?? null,
        },
      });

      await tx.equipamentos.update({
        where: { id: equipamento },
        data: {
          ativo_funcional_id: destino,
          ativo_na_posicao: true,
          unidade_id: alvo.unidade_id,
        },
      });

      return vinculo;
    });
  }

  /**
   * As posicoes de uma instalacao, cada uma dizendo se ja tem ocupante.
   *
   * A ocupacao vem junto de proposito. E ela que faz o aviso de "posicao ja tem
   * equipamento" aparecer no momento da escolha, e nao como erro depois do
   * submit — que e quando o usuario ja preencheu o formulario inteiro.
   */
  async listar(filtros: { unidade_id?: string } = {}) {
    const posicoes = await this.prisma.ativos_funcionais.findMany({
      where: {
        deleted_at: null,
        ...(filtros.unidade_id ? { unidade_id: filtros.unidade_id.trim() } : {}),
      },
      orderBy: { nome: "asc" },
      include: {
        categoria: { select: { id: true, nome: true } },
        equipamentos: {
          where: { ativo_na_posicao: true, deleted_at: null },
          select: { id: true, nome: true, modelo: true, numero_serie: true },
          take: 1,
        },
      },
    });

    return posicoes.map(({ equipamentos, ...posicao }) => ({
      ...posicao,
      ocupada: equipamentos.length > 0,
      equipamento_ativo: equipamentos[0] ?? null,
    }));
  }

  /**
   * Uma posicao com o ocupante atual e os que ja passaram, separados.
   *
   * Separados porque a tela trata os dois de forma diferente: o ativo e
   * editavel, os anteriores sao registro. Devolver tudo numa lista so obrigaria
   * o front a refazer essa distincao — e a errar quando a posicao esta vazia.
   */
  async buscarPorId(id: string) {
    const posicao = await this.prisma.ativos_funcionais.findFirst({
      where: { id: id.trim(), deleted_at: null },
      include: {
        categoria: { select: { id: true, nome: true } },
        unidade: { select: { id: true, nome: true } },
      },
    });
    if (!posicao) throw new NotFoundException("Ativo funcional nao encontrado");

    const vinculos = await this.prisma.ativos_funcionais_equipamentos.findMany({
      where: { ativo_funcional_id: posicao.id },
      orderBy: { instalado_em: "desc" },
      include: {
        equipamento: {
          select: { id: true, nome: true, modelo: true, numero_serie: true, fabricante: true },
        },
      },
    });

    const aberto = vinculos.find(v => v.removido_em === null) ?? null;

    return {
      ...posicao,
      equipamento_ativo: aberto?.equipamento ?? null,
      anteriores: vinculos.filter(v => v.removido_em !== null),
    };
  }

  /**
   * O plano do ocupante anterior, para a tela oferecer a heranca.
   *
   * Delega para `planos-manutencao/heranca-de-plano.ts`: plano e assunto do
   * Service, e a regra fica junto do modulo que a entende.
   */
  async planoAHerdar(ativoFuncionalId: string) {
    return planoAHerdar(this.prisma, ativoFuncionalId);
  }

  /** Tudo que ja passou pela posicao, do mais recente para o mais antigo. */
  async historico(ativoFuncionalId: string) {
    return this.prisma.ativos_funcionais_equipamentos.findMany({
      where: { ativo_funcional_id: ativoFuncionalId.trim() },
      orderBy: { instalado_em: 'desc' },
    });
  }
}

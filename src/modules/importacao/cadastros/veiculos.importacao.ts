import { Injectable } from '@nestjs/common';
import { PrismaService, veiculo } from '@/core';
import { VeiculosService } from '@/modules/veiculos/veiculos.service';
import { CreateVeiculoDto } from '@/modules/veiculos/dto/create-veiculo.dto';
import { UpdateVeiculoDto } from '@/modules/veiculos/dto/update-veiculo.dto';
import { CadastroImportavel, UsuarioDaImportacao } from '../importacao.types';

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Veículos: cadastro plano, com o escopo de planta do VeiculosService (o
 * veículo sem planta só é visto por quem não tem escopo).
 *
 * Inativar não passa pela planilha: na tela é uma ação própria, com motivo, e
 * cancela as reservas futuras.
 */
@Injectable()
export class VeiculosImportacao implements CadastroImportavel<veiculo> {
  readonly singular = 'veículo';
  readonly dtoDeCriacao = CreateVeiculoDto;
  readonly dtoDeEdicao = UpdateVeiculoDto;

  constructor(
    private readonly veiculos: VeiculosService,
    private readonly prisma: PrismaService,
  ) {}

  async buscar(id: string, usuario: UsuarioDaImportacao) {
    // O service aplica o escopo (403 fora dele); o registro cru é para o retrato.
    await this.veiculos.buscarPorId(id, usuario);
    return this.prisma.veiculo.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Com reserva ativa, o service recusa qualquer `placa` no payload, mesmo
   * igual à atual. A planilha manda a linha inteira: a placa que não mudou
   * sai, senão reimportar sem mexer daria erro.
   */
  async prepararDados(dados: Record<string, unknown>, _usuario: UsuarioDaImportacao, atual: veiculo | null) {
    if (atual && dados.placa === atual.placa) {
      const { placa: _mesma, ...resto } = dados;
      return resto;
    }
    return dados;
  }

  async criar(dto: object, usuario: UsuarioDaImportacao) {
    return this.veiculos.criar(dto as CreateVeiculoDto, usuario);
  }

  atualizar(atual: veiculo, dto: object, usuario: UsuarioDaImportacao) {
    return this.veiculos.atualizar(atual.id, dto as UpdateVeiculoDto, usuario);
  }

  async retrato(id: string) {
    const v = await this.prisma.veiculo.findUniqueOrThrow({ where: { id } });
    return {
      nome: v.nome,
      placa: v.placa,
      marca: v.marca,
      modelo: v.modelo,
      ano_fabricacao: v.ano_fabricacao,
      cor: v.cor,
      tipo: v.tipo,
      tipo_combustivel: v.tipo_combustivel,
      capacidade_passageiros: v.capacidade_passageiros,
      capacidade_carga: numero(v.capacidade_carga),
      quilometragem: v.quilometragem,
      proxima_revisao: dia(v.proxima_revisao),
      responsavel: v.responsavel,
      localizacao_atual: v.localizacao_atual,
      chassi: v.chassi,
      renavam: v.renavam,
      seguradora: v.seguradora,
      vencimento_seguro: dia(v.vencimento_seguro),
      observacoes: v.observacoes,
    };
  }

  idDe(atual: veiculo) {
    return atual.id.trim();
  }

  nomeDe(atual: veiculo | null, dto: object) {
    return (dto as UpdateVeiculoDto).nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: veiculo) {
    return atual.atualizado_em;
  }
}

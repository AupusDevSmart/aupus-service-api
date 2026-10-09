import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, UsuariosService, usuarios } from '@/core';
import { CreateUsuarioDto } from '@/core/modules/usuarios/dto/create-usuario.dto';
import { UpdateUsuarioDto } from '@/core/modules/usuarios/dto/update-usuario.dto';
import { CadastroImportavel, ErrosDaLinha, UsuarioDaImportacao } from '../importacao.types';
import { chave } from '../catalogo-por-nome';
import { semOQueNaoMudou } from '../sem-o-que-nao-mudou';

const MODEL_TYPE = 'App\\Models\\User';

/**
 * Campo do formulário → coluna, para não revalidar o que não mudou. O
 * `status` fica sempre: o UpdateUsuarioDto herda o padrão "Ativo" do
 * CreateUsuarioDto, e sem ele no payload um inativo voltaria a ativo.
 */
const COLUNAS: Record<string, keyof usuarios> = {
  nome: 'nome',
  email: 'email',
  telefone: 'telefone',
  cpfCnpj: 'cpf_cnpj',
  cep: 'cep',
  estado: 'estado',
  cidade: 'cidade',
  endereco: 'endereco',
};

/**
 * Usuários: cadastro plano. O que entra e o que não entra foi decidido com o
 * usuário (09/out/2026):
 *
 * - O TIPO (papel) entra pelo nome do papel. Trocar exige poder criar usuário
 *   daquele papel (`usuarios.create_<papel>`) — a mesma hierarquia da criação.
 * - Permissões diretas NÃO passam pela planilha. Usuário novo recebe as do
 *   papel, como o formulário marca sozinho; trocar o TIPO de quem já existe
 *   não mexe nelas, e a prévia avisa.
 * - Senha nunca passa pela planilha: o usuário novo segue o fluxo da tela
 *   (senha provisória e e-mail de boas-vindas, que só sai depois de confirmar).
 * - Plantas que um operador opera ficam na tela de operadores.
 */
@Injectable()
export class UsuariosImportacao implements CadastroImportavel<usuarios> {
  readonly singular = 'usuário';
  readonly dtoDeCriacao = CreateUsuarioDto;
  readonly dtoDeEdicao = UpdateUsuarioDto;

  constructor(
    private readonly usuarios: UsuariosService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * O mesmo recorte da listagem: proprietário só enxerga os usuários que ele
   * criou e a si mesmo.
   */
  async buscar(id: string, usuario: UsuarioDaImportacao) {
    const alvo = await this.prisma.usuarios.findFirst({ where: { id, deleted_at: null } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado');

    if (await this.ehProprietario(usuario.id)) {
      const criouOuEhEle = alvo.created_by?.trim() === usuario.id || alvo.id.trim() === usuario.id;
      if (!criouOuEhEle) throw new NotFoundException('Usuário não encontrado');
    }

    return alvo;
  }

  /** O TIPO (nome do papel) → `roleId`; e, no usuário novo, as permissões do papel. */
  async prepararDados(dados: Record<string, unknown>, _usuario: UsuarioDaImportacao, atual: usuarios | null) {
    const { tipo, ...lidos } = dados;
    const resto = semOQueNaoMudou(lidos, atual, COLUNAS);
    const texto = typeof tipo === 'string' ? tipo.trim() : '';

    if (!texto) {
      if (atual) return resto;
      throw ErrosDaLinha.em('tipo', 'Informe o TIPO do usuário novo.');
    }

    if (atual && chave(texto) === chave(await this.papelAtual(atual.id))) return resto;

    const papel = await this.prisma.roles.findFirst({
      where: { name: { equals: texto, mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
    if (!papel) throw ErrosDaLinha.em('tipo', `Não existe o tipo de usuário "${texto}".`);

    const comPapel: Record<string, unknown> = { ...resto, roleId: Number(papel.id) };
    if (!atual) comPapel.permissionIds = await this.permissoesDoPapel(papel.id);
    return comPapel;
  }

  async autorizar(usuario: UsuarioDaImportacao, dto: object, atual: usuarios | null) {
    if (atual && !usuario.permissions.includes('usuarios.manage')) {
      throw new ForbiddenException('Você não tem permissão para editar usuários (usuarios.manage).');
    }

    const { roleId } = dto as UpdateUsuarioDto;
    if (!roleId) return;

    const papel = await this.prisma.roles.findUniqueOrThrow({ where: { id: BigInt(roleId) } });
    const exigida = `usuarios.create_${papel.name}`;
    if (!usuario.permissions.includes(exigida)) {
      throw ErrosDaLinha.em('tipo', `Você não tem permissão para dar o tipo "${papel.name}" a um usuário. Requer: ${exigida}.`);
    }
  }

  async criar(dto: object, usuario: UsuarioDaImportacao) {
    return this.usuarios.create(dto as CreateUsuarioDto, usuario);
  }

  atualizar(atual: usuarios, dto: object, usuario: UsuarioDaImportacao) {
    return this.usuarios.update(atual.id, dto as UpdateUsuarioDto, usuario);
  }

  avisos(atual: usuarios | null, dto: object) {
    return atual && (dto as UpdateUsuarioDto).roleId
      ? ['O TIPO deste usuário muda. As permissões diretas dele ficam como estão: revise-as na tela depois de importar.']
      : [];
  }

  async retrato(id: string) {
    const u = await this.prisma.usuarios.findUniqueOrThrow({ where: { id } });
    const diretas = await this.prisma.model_has_permissions.findMany({
      where: { model_id: id, model_type: MODEL_TYPE },
      select: { permission_id: true },
    });
    return {
      nome: u.nome,
      email: u.email,
      telefone: u.telefone,
      status: u.status,
      cpf_cnpj: u.cpf_cnpj,
      cep: u.cep,
      estado: u.estado,
      cidade: u.cidade,
      endereco: u.endereco,
      papel: await this.papelAtual(id),
      permissoes: diretas.map((p) => Number(p.permission_id)).sort((a, b) => a - b),
    };
  }

  idDe(atual: usuarios) {
    return atual.id.trim();
  }

  nomeDe(atual: usuarios | null, dto: object) {
    return (dto as UpdateUsuarioDto).nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: usuarios) {
    return atual.updated_at;
  }

  /** O papel do Spatie e, sem ele, a coluna legada — o que a tela mostra. */
  private async papelAtual(id: string): Promise<string | null> {
    const vinculo = await this.prisma.model_has_roles.findFirst({
      where: { model_id: id, model_type: MODEL_TYPE },
      include: { roles: true },
    });
    if (vinculo) return vinculo.roles.name;
    return (await this.prisma.usuarios.findUnique({ where: { id }, select: { role: true } }))?.role ?? null;
  }

  /**
   * As permissões que o formulário marca sozinho ao escolher o papel: as do
   * papel, pelo nome, cada uma no primeiro id que tem esse nome (é o que a
   * tela faz ao converter nome em id).
   */
  private async permissoesDoPapel(papelId: bigint): Promise<number[]> {
    const doPapel = await this.prisma.role_has_permissions.findMany({
      where: { role_id: papelId },
      include: { permissions: { select: { name: true } } },
    });
    const nomes = [...new Set(doPapel.map((p) => p.permissions.name))];
    const permissoes = await this.prisma.permissions.findMany({
      where: { name: { in: nomes } },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    const primeiraPorNome = new Map<string, number>();
    for (const p of permissoes) if (!primeiraPorNome.has(p.name)) primeiraPorNome.set(p.name, Number(p.id));
    return [...primeiraPorNome.values()];
  }

  /** Como a listagem decide: pela coluna legada `role`. */
  private async ehProprietario(id: string) {
    const quem = await this.prisma.usuarios.findFirst({ where: { id, deleted_at: null }, select: { role: true } });
    return quem?.role === 'proprietario' || quem?.role === 'propietario';
  }
}

// src/modules/usuarios/usuarios.service.ts - VERSÃO COMPLETA E CORRIGIDA
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger
} from '@nestjs/common';
import { normalizarEmail } from '../../../common/helpers/contato';
import { Prisma, roles, usuarios } from '@prisma/client';
// Builtins do Node, sem efeito colateral na carga: nao ha por que adia-los com
// require() dentro da funcao, que alem de esconder a dependencia obriga o TS a
// tratar o modulo como `any`.
import { promises as arquivos } from 'fs';
import * as caminho from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { depoisDeGravar } from '../../prisma/transacao-em-curso';
import { RolesService } from '../roles/roles.service';
import { PermissionsService } from '../permissions/permissions.service';
import { 
  CreateUsuarioDto, 
  UpdateUsuarioDto, 
  UsuarioQueryDto,
  ChangePasswordDto,
  ResetPasswordDto,
  UsuarioStatus,
  UsuarioResponseDto,
  UserPermissionsResponseDto,
  UserPermissionsSummaryDto,
  CategorizedPermissionsDto,
  BulkAssignRolesDto,
  BulkAssignPermissionsDto
} from './dto';
import * as bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { MailService } from '../../mail/mail.service';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { gerarSenhaProvisoria } from './senha-provisoria';
import {
  PAPEL_TOPO,
  Solicitante,
  extrasQueNaoPodeDar,
  mesmoUsuario,
  permissaoDoPapel,
  podeLidarComPapel,
} from './hierarquia-de-papeis';

const MODEL_TYPE = 'App\\Models\\User';

type PermissaoMinima = { id: bigint; name: string };

/** Uma permissão como as rotas de papel e de permissão direta a devolvem. */
type PermissaoResumida = { id: number; name: string; guard_name: string };

/** O papel atribuído, com as permissões que ele dá. */
type PapelComPermissoes = PermissaoResumida & { permissions: PermissaoResumida[] };

/** Um item de operação em lote que falhou, e o motivo. */
type FalhaDoLote = { userId: string; roleId?: number; permissionIds?: number[]; error: string };

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    private prisma: PrismaService,
    private rolesService: RolesService,
    private permissionsService: PermissionsService,
    private mailService: MailService,
  ) {}

  async findAll(query: UsuarioQueryDto, requestingUserId?: string) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      role,
      roles,
      cidade,
      estado,
      concessionariaId,
      organizacaoId,
      includeInactive = false,
    } = query;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.usuariosWhereInput = {};

    // Cada grupo de OR entra AQUI, e nao direto em where.OR.
    //
    // Antes, escopo do proprietario, filtro de roles e busca textual escreviam
    // os tres em where.OR — o ultimo a rodar apagava os anteriores. Na pratica:
    // um proprietario que digitasse qualquer coisa na busca perdia o recorte
    // por created_by e passava a enxergar TODOS os usuarios do sistema.
    const grupos: Prisma.usuariosWhereInput[] = [];

    // Filtrar apenas ativos por padrão
    if (!includeInactive) {
      where.deleted_at = null;
      where.is_active = true;
    }

    if (status) {
      where.status = status;
    }

    // ============================================================================
    // FILTRO ESPECIAL PARA PROPRIETÁRIOS - OTIMIZADO
    // Se o usuário logado é proprietário, mostrar apenas operadores que ele criou
    // ============================================================================
    if (requestingUserId) {
      // ✅ OTIMIZAÇÃO: Buscar dados do usuário em UMA query com JOIN
      const requestingUserData = await this.prisma.usuarios.findFirst({
        where: { id: requestingUserId, deleted_at: null },
        select: {
          role: true, // role legacy
        }
      });

      // Verificar se é proprietário APENAS pela coluna role (mais rápido)
      const isProprietario = requestingUserData?.role === 'proprietario' ||
                            requestingUserData?.role === 'propietario';

      if (isProprietario) {
        // Proprietário vê apenas operadores criados por ele + ele mesmo
        grupos.push({
          OR: [
            { created_by: requestingUserId }, // Operadores que ele criou
            { id: requestingUserId }          // Ele mesmo
          ]
        });
        this.logger.log(`🔒 [FINDALL] Proprietário ${requestingUserId} - filtrando por created_by OU próprio ID`);
      } else {
        this.logger.log(`✅ [FINDALL] Usuário ${requestingUserId} NÃO é proprietário - sem filtro created_by`);
      }
    }

    // Filtrar por role (singular) - case-insensitive
    if (role) {
      where.role = {
        equals: role,
        mode: 'insensitive'
      };
    }

    // Filtrar por múltiplas roles (plural) - case-insensitive - tem prioridade sobre singular
    if (roles) {
      const roleArray = roles.split(',').map(r => r.trim());
      grupos.push({
        OR: roleArray.map(r => ({
          role: {
            equals: r,
            mode: 'insensitive'
          }
        }))
      });
    }

    if (cidade) {
      where.cidade = {
        contains: cidade,
        mode: 'insensitive'
      };
    }

    if (estado) {
      where.estado = {
        contains: estado,
        mode: 'insensitive'
      };
    }

    if (concessionariaId) {
      where.concessionaria_atual_id = concessionariaId;
    }

    if (organizacaoId) {
      where.organizacao_atual_id = organizacaoId;
    }

    // Filtro de busca
    if (search) {
      // O telefone está em E.164 (SN-46): "99999-8888" ou "(62) 9999" acham
      // pelos dígitos
      const digitos = search.replace(/\D/g, '');
      grupos.push({
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { telefone: { contains: search, mode: 'insensitive' } },
          ...(digitos.length >= 4 ? [{ telefone: { contains: digitos } }] : []),
          { cpf_cnpj: { contains: search, mode: 'insensitive' } },
        ]
      });
    }

    // Todos os grupos valem ao mesmo tempo; nenhum sobrescreve o outro.
    if (grupos.length > 0) {
      where.AND = grupos;
    }

    try {
      const startTime = Date.now();

      // Buscar usuários e count separadamente para reduzir carga
      this.logger.log(`⏱️ [FINDALL] Iniciando query de usuários...`);
      const usuarios = await this.prisma.usuarios.findMany({
        where,
        // O id desempata, e sem ele a paginacao mentia.
        //
        // created_at e nullable e tem precisao de SEGUNDO (Timestamp(0)); em
        // DEV, 34 dos 58 usuarios ativos estao com NULL. Ordenar so por ele
        // deixa dezenas de linhas empatadas, e o Postgres nao promete ordem
        // estavel entre empatados: cada requisicao pode devolve-los numa ordem
        // diferente. Com OFFSET/LIMIT isso faz as fatias se sobreporem — o
        // mesmo usuario aparecia em duas ou tres paginas, e outros nao
        // apareciam em nenhuma. Sendo chave primaria, o id da uma ordem total.
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip,
        take: limit,
      });
      const queryTime = Date.now() - startTime;
      this.logger.log(`✅ [FINDALL] Query completada em ${queryTime}ms - ${usuarios.length} usuários encontrados`);

      const countStart = Date.now();
      const total = await this.prisma.usuarios.count({ where });
      const countTime = Date.now() - countStart;
      this.logger.log(`✅ [FINDALL] Count completado em ${countTime}ms - Total: ${total}`);

      // Mapear para DTO compatível de forma mais eficiente
      const mapStart = Date.now();
      const usuariosFormatados = await Promise.all(
        usuarios.map(usuario => this.mapToUsuarioResponseDtoOptimized(usuario))
      );
      const mapTime = Date.now() - mapStart;
      this.logger.log(`✅ [FINDALL] Mapeamento completado em ${mapTime}ms`);

      const totalTime = Date.now() - startTime;
      this.logger.log(`🎯 [FINDALL] TEMPO TOTAL: ${totalTime}ms`);

      return {
        data: usuariosFormatados,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('❌ Erro ao buscar usuários:', error);
      throw new BadRequestException('Erro ao buscar usuários');
    }
  }

  async findOne(id: string): Promise<UsuarioResponseDto> {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: {
          id,
          deleted_at: null
        }
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      return await this.mapToUsuarioResponseDto(usuario);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao buscar usuário:', error);
      throw new BadRequestException('Erro ao buscar usuário');
    }
  }

  /**
   * As contas com este e-mail, sem caixa (SN-46): as vivas antes das excluídas,
   * o id desempata. SQL com `lower(email) = lower(...)` (usa o índice
   * usuarios_email_lower_unique) e não o `mode: 'insensitive'` do Prisma: ele
   * vira ILIKE sem escapar, e `%` e `_` no e-mail eram curinga — o login e o
   * "esqueci" achavam conta sem saber o endereço (revisão de segurança).
   */
  private contasPorEmail(email: string, semEsta?: string): Promise<{ id: string; email: string; deleted_at: Date | null }[]> {
    return this.prisma.$queryRaw<{ id: string; email: string; deleted_at: Date | null }[]>`
      SELECT id, email, deleted_at FROM usuarios
      WHERE lower(email) = lower(${email.trim()})
      ${semEsta ? Prisma.sql`AND trim(id) <> ${semEsta.trim()}` : Prisma.empty}
      ORDER BY (deleted_at IS NOT NULL), id`;
  }

  /**
   * E-mail que outra conta usa: viva, 409; excluída, o e-mail dela é liberado
   * (`deleted_<id>_<email>`) para o novo ficar com ele — o índice sem caixa
   * não deixaria os dois. Vale no cadastro, na edição e no perfil.
   */
  private async liberarOuRecusarEmail(email: string, semEsta?: string): Promise<void> {
    const outras = await this.contasPorEmail(email, semEsta);
    if (outras.some((o) => !o.deleted_at)) throw new ConflictException('Email já está em uso');
    // Todas as excluídas: com o dado de antes do saneamento podem ser mais de uma
    for (const excluida of outras) {
      await this.prisma.usuarios.update({
        where: { id: excluida.id },
        data: { email: `deleted_${excluida.id.trim()}_${excluida.email}` },
      });
    }
  }

  /**
   * Busca usuário por email (usado para autenticação)
   * Retorna o usuário com a senha para validação
   */
  async findByEmail(email: string) {
    try {
      // Sem caixa: `Ana@` e `ana@` são o mesmo login (SN-46)
      const [conta] = await this.contasPorEmail(email);
      const usuario = conta ? await this.prisma.usuarios.findUnique({ where: { id: conta.id } }) : null;

      return usuario; // Retorna null se não encontrar
    } catch (error) {
      console.error('Erro ao buscar usuário por email:', error);
      throw new BadRequestException('Erro ao buscar usuário por email');
    }
  }

  /**
   * Cria o usuário com o papel e as permissões diretas pedidos. A hierarquia
   * (hierarquia-de-papeis.ts) é conferida ANTES de gravar qualquer coisa, por
   * qualquer caminho do payload (`roleId` ou `roleNames`, `permissionIds` ou
   * `permissions`). Sem `solicitante` (chamada interna) a hierarquia não se
   * aplica.
   */
  async create(
    data: CreateUsuarioDto,
    creatingUser?: Solicitante | string,
  ): Promise<UsuarioResponseDto> {
    try {
      const solicitante = typeof creatingUser === 'object' ? creatingUser : undefined;
      const creatingUserId = typeof creatingUser === 'string' ? creatingUser : creatingUser?.id;

      let papel = await this.papelPedido(data);
      // Proprietário que não escolhe o tipo cria operador: é o único que ele pode criar.
      if (!papel && solicitante?.role === 'proprietario') papel = await this.papelPorNome('operador');
      if (!papel) throw new BadRequestException('Informe o tipo do usuário.');
      if (solicitante) await this.exigirPodeLidarComPapel(solicitante, papel.name, 'criar usuário do tipo');

      const pedidas = await this.permissoesPedidas(data);
      const extras = pedidas ? await this.semAsDoPapel(pedidas, papel.id) : [];
      if (solicitante) this.exigirPodeDarExtras(solicitante, extras.map((p) => p.name));

      // E-mail repetido, sem caixa (SN-46)
      data.email = normalizarEmail(data.email) as string;
      await this.liberarOuRecusarEmail(data.email);

      if (creatingUserId) data.createdBy = creatingUserId;

      // Gerar ID
      const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 26);
      const userId = nanoid();

      // Senha provisória própria; a pessoa troca no primeiro acesso (SN-34)
      const senhaTemporaria = gerarSenhaProvisoria();
      const hashedPassword = await bcrypt.hash(senhaTemporaria, 12);

      const novoUsuario = await this.prisma.usuarios.create({
        data: {
          id: userId,
          nome: data.nome,
          email: data.email,
          telefone: data.telefone,
          instagram: data.instagram,
          status: data.status || UsuarioStatus.ATIVO,
          cpf_cnpj: data.cpfCnpj,
          cidade: data.cidade,
          estado: data.estado,
          endereco: data.endereco,
          cep: data.cep,
          // Coluna legada, lida pelo AupusNexOn e pela listagem: o mesmo papel do Spatie.
          role: this.mapSpatieRoleToValidDbRole(papel.name),
          manager_id: data.managerId,
          concessionaria_atual_id: data.concessionariaAtualId,
          organizacao_atual_id: data.organizacaoAtualId,
          created_by: data.createdBy,
          is_active: true,
          senha: hashedPassword,
          deve_trocar_senha: true,
        }
      });

      try {
        await this.assignRole(userId, Number(papel.id));
        if (extras.length > 0) await this.syncUserPermissions(userId, extras.map((p) => Number(p.id)));
      } catch (error) {
        // Usuário sem o papel pedido não pode ficar: desfaz e devolve o erro.
        await this.prisma.model_has_roles.deleteMany({ where: { model_id: userId, model_type: MODEL_TYPE } });
        await this.prisma.usuarios.delete({ where: { id: userId } });
        throw error;
      }

      // Enviar email de boas-vindas (fire-and-forget). Dentro de uma importação
      // de planilha, só depois de confirmada: a prévia desfaz o usuário.
      depoisDeGravar(() =>
        this.mailService
          .sendWelcomeEmail(data.email, data.nome, senhaTemporaria)
          .catch(err => this.logger.error(`Erro ao enviar email de boas-vindas: ${err.message}`)),
      );

      const result = await this.mapToUsuarioResponseDto(novoUsuario);

      // Adicionar informações extras para resposta de criação
      return {
        ...result,
        senhaTemporaria, // Para informar ao frontend
        primeiroAcesso: true,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Erro ao criar usuário: ${error.message}`);
      throw new BadRequestException('Erro ao criar usuário: ' + error.message);
    }
  }

  /**
   * Edita o usuário. Mexer em outra pessoa exige poder lidar com o papel que
   * ela tem hoje; trocar o tipo exige poder lidar com o papel novo; a lista de
   * permissões, quando vem (mesmo vazia), é a lista completa das diretas.
   */
  async update(
    id: string,
    data: UpdateUsuarioDto,
    requester?: Solicitante,
  ): Promise<UsuarioResponseDto> {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: {
          id,
          deleted_at: null
        },
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      const ehOProprio = mesmoUsuario(requester?.id, id);
      if (requester && !ehOProprio) await this.exigirPodeGerenciar(requester, id);

      const papelAtual = await this.vinculoDePapel(id);
      const papelNovo = await this.papelPedido(data);
      const trocaPapel = !!papelNovo && papelNovo.name !== papelAtual?.name;
      const tiraPapel = !!data.clearRole && !!papelAtual;
      if (requester && (trocaPapel || tiraPapel)) {
        if (ehOProprio) throw new ForbiddenException('Você não pode mudar o próprio tipo de usuário.');
        if (papelNovo) await this.exigirPodeLidarComPapel(requester, papelNovo.name, 'dar o tipo');
      }

      const papelFinal = trocaPapel ? papelNovo : tiraPapel ? null : papelAtual;
      const pedidas = data.clearDirectPermissions ? [] : await this.permissoesPedidas(data);
      const extras = pedidas ? await this.semAsDoPapel(pedidas, papelFinal?.id ?? null) : undefined;
      if (requester && extras) {
        // As diretas de hoje que o papel não cobre (as redundantes, de cadastro antigo, não contam).
        const doPapel = await this.semAsDoPapel(await this.diretasDe(id), papelFinal?.id ?? null);
        const atuais = new Set(doPapel.map((p) => p.name));
        const novas = extras.filter((p) => !atuais.has(p.name)).map((p) => p.name);
        const mudou = novas.length > 0 || atuais.size !== new Set(extras.map((p) => p.name)).size;
        if (ehOProprio && mudou) throw new ForbiddenException('Você não pode mudar as próprias permissões.');
        this.exigirPodeDarExtras(requester, novas);
      }

      // Verificar email duplicado
      if (data.email && data.email !== usuario.email) {
        data.email = normalizarEmail(data.email) as string;
        await this.liberarOuRecusarEmail(data.email, id);
      }

      // Preparar dados para atualização
      const updateData: Prisma.usuariosUncheckedUpdateInput = {};
      if (data.nome !== undefined) updateData.nome = data.nome;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.telefone !== undefined) updateData.telefone = data.telefone;
      if (data.instagram !== undefined) updateData.instagram = data.instagram;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.cpfCnpj !== undefined) updateData.cpf_cnpj = data.cpfCnpj;
      if (data.cidade !== undefined) updateData.cidade = data.cidade;
      if (data.estado !== undefined) updateData.estado = data.estado;
      if (data.endereco !== undefined) updateData.endereco = data.endereco;
      if (data.cep !== undefined) updateData.cep = data.cep;
      if (data.managerId !== undefined) updateData.manager_id = data.managerId;
      if (data.concessionariaAtualId !== undefined) updateData.concessionaria_atual_id = data.concessionariaAtualId;
      if (data.organizacaoAtualId !== undefined) updateData.organizacao_atual_id = data.organizacaoAtualId;

      updateData.updated_at = new Date();

      // Atualizar usuário base
      const usuarioAtualizado = await this.prisma.usuarios.update({
        where: { id },
        data: updateData
      });

      if (trocaPapel) await this.assignRole(id, Number(papelNovo!.id));
      if (tiraPapel && !trocaPapel) {
        await this.prisma.model_has_roles.deleteMany({ where: { model_id: id, model_type: MODEL_TYPE } });
        await this.prisma.usuarios.update({ where: { id }, data: { role: null } });
      }
      if (extras) await this.syncUserPermissions(id, extras.map((p) => Number(p.id)));

      return await this.mapToUsuarioResponseDto(usuarioAtualizado);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Erro ao atualizar usuário: ${error.message}`);
      throw new BadRequestException('Erro ao atualizar usuário');
    }
  }

  /**
   * O próprio usuário edita os dados dele (tela "Meu perfil"). Não passa pela
   * permissão `usuarios.manage` e não toca em tipo, permissões nem status.
   */
  async atualizarPerfil(id: string, data: AtualizarPerfilDto): Promise<UsuarioResponseDto> {
    const usuario = await this.prisma.usuarios.findFirst({ where: { id, deleted_at: null } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    if (data.email && data.email !== usuario.email) {
      // A mesma regra do cadastro: sem caixa (antes esta checagem ficou exata)
      data.email = normalizarEmail(data.email) as string;
      await this.liberarOuRecusarEmail(data.email, id);
    }

    const atualizado = await this.prisma.usuarios.update({
      where: { id },
      data: {
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        instagram: data.instagram,
        cpf_cnpj: data.cpfCnpj,
        cidade: data.cidade,
        estado: data.estado,
        endereco: data.endereco,
        cep: data.cep,
        updated_at: new Date(),
      },
    });
    return this.mapToUsuarioResponseDto(atualizado);
  }

  async remove(id: string, requester?: Solicitante) {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: {
          id,
          deleted_at: null
        },
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (requester) {
        if (mesmoUsuario(requester.id, id)) throw new ForbiddenException('Você não pode excluir o próprio usuário.');
        await this.exigirPodeGerenciar(requester, id);
      }

      await this.prisma.usuarios.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          is_active: false,
          status: UsuarioStatus.INATIVO,
        },
      });

      return { message: 'Usuário excluído com sucesso' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Erro ao excluir usuário: ${error.message}`);
      throw new BadRequestException('Erro ao excluir usuário');
    }
  }

  /** Troca a senha sabendo a atual: só a própria. */
  async changePassword(id: string, data: ChangePasswordDto, requester?: Solicitante) {
    try {
      if (requester && !mesmoUsuario(requester.id, id)) {
        throw new ForbiddenException('Só é possível trocar a própria senha.');
      }

      const usuario = await this.prisma.usuarios.findFirst({
        where: {
          id,
          deleted_at: null
        },
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (!usuario.senha) {
        throw new BadRequestException('Usuário não possui senha definida');
      }

      // Verificar senha atual
      const senhaValida = await bcrypt.compare(data.senhaAtual, usuario.senha);
      if (!senhaValida) {
        throw new BadRequestException('Senha atual incorreta');
      }

      // A senha provisória tem de virar outra; e a padrão antiga todo mundo conhecia (SN-34)
      if (data.novaSenha === data.senhaAtual) {
        throw new BadRequestException('A nova senha precisa ser diferente da atual.');
      }
      if (data.novaSenha === 'Aupus123!') {
        throw new BadRequestException('Essa era a senha padrão de todos os usuários: escolha outra.');
      }

      // Hash da nova senha
      const novaSenhaHash = await bcrypt.hash(data.novaSenha, 12);

      await this.prisma.usuarios.update({
        where: { id },
        data: {
          senha: novaSenhaHash,
          // Trocou a própria senha: acabou o primeiro acesso
          deve_trocar_senha: false,
          updated_at: new Date(),
        },
      });

      return { message: 'Senha alterada com sucesso' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Erro ao alterar senha: ${error.message}`);
      throw new BadRequestException('Erro ao alterar senha');
    }
  }

  /** Define a senha de outra pessoa sem saber a atual: exige poder gerenciar o tipo dela. */
  async resetPassword(id: string, data: ResetPasswordDto, requester?: Solicitante) {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: {
          id,
          deleted_at: null
        },
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (requester) await this.exigirPodeGerenciar(requester, id);

      const novaSenhaHash = await bcrypt.hash(data.novaSenha, 12);

      await this.prisma.usuarios.update({
        where: { id },
        data: {
          senha: novaSenhaHash,
          // Outra pessoa definiu a senha: quem é dono dela troca no próximo acesso
          deve_trocar_senha: true,
          updated_at: new Date(),
        },
      });

      return {
        message: 'Senha resetada com sucesso',
        senhaTemporaria: data.novaSenha
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Erro ao resetar senha: ${error.message}`);
      throw new BadRequestException('Erro ao resetar senha');
    }
  }

  /** A própria foto, ou a de quem o solicitante pode gerenciar. */
  async updateAvatar(userId: string, filename: string, requester?: Solicitante) {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: {
          id: userId,
          deleted_at: null
        },
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (requester && !mesmoUsuario(requester.id, userId)) {
        if (!requester.permissions.includes('usuarios.manage') && requester.role !== PAPEL_TOPO) {
          throw new ForbiddenException('Só é possível trocar a própria foto.');
        }
        await this.exigirPodeGerenciar(requester, userId);
      }

      // Se o usuário já tem um avatar, deletar o arquivo antigo
      if (usuario.avatar_url) {
        const oldFilePath = caminho.join(__dirname, '../../..', usuario.avatar_url);
        await arquivos.unlink(oldFilePath).catch(() => undefined);
      }

      const imageUrl = `/uploads/avatars/${filename}`;

      await this.prisma.usuarios.update({
        where: { id: userId },
        data: {
          avatar_url: imageUrl,
          updated_at: new Date(),
        },
      });

      return { imageUrl };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Erro ao atualizar avatar: ${error.message}`);
      throw new BadRequestException('Erro ao atualizar avatar');
    }
  }

  // ============================================================================
  // MÉTODOS DE GESTÃO DE ROLES E PERMISSIONS - VERSÃO COMPLETA
  // ============================================================================

  /**
   * Busca informações detalhadas sobre as permissões de um usuário
   */
  async getUserPermissions(userId: string): Promise<UserPermissionsResponseDto> {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: { 
          id: userId, 
          deleted_at: null 
        }
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      // Buscar role do usuário com suas permissões. Com mais de um papel (dado
      // legado), vale o de menor id: a mesma regra de quem recebe notificação
      // (notificacoes/registro-da-notificacao.ts). Sem ordem, o papel — e com
      // ele o escopo por planta — dependia do plano do Postgres.
      const userRole = await this.prisma.model_has_roles.findFirst({
        orderBy: { role_id: 'asc' },
        where: {
          model_id: userId,
          model_type: 'App\\Models\\User'
        },
        include: {
          roles: {
            include: {
              role_has_permissions: {
                include: {
                  permissions: true
                }
              }
            }
          }
        }
      });

      // Buscar permissões diretas do usuário
      const userDirectPermissions = await this.prisma.model_has_permissions.findMany({
        where: {
          model_id: userId,
          model_type: 'App\\Models\\User'
        },
        include: {
          permissions: true
        }
      });

      // Formatar role
      const role = userRole ? {
        id: Number(userRole.roles.id),
        name: userRole.roles.name,
        guard_name: userRole.roles.guard_name
      } : null;

      // Formatar permissões do role
      const rolePermissions = userRole?.roles.role_has_permissions.map(rhp => ({
        id: Number(rhp.permissions.id),
        name: rhp.permissions.name,
        guard_name: rhp.permissions.guard_name,
        source: 'role' as const
      })) || [];

      // Formatar permissões diretas
      const directPermissions = userDirectPermissions.map(mhp => ({
        id: Number(mhp.permissions.id),
        name: mhp.permissions.name,
        guard_name: mhp.permissions.guard_name,
        source: 'direct' as const
      }));

      // Combinar permissões (permissão direta sobrescreve role)
      const allPermissions: Array<{
        id: number;
        name: string;
        guard_name: string;
        source: 'role' | 'direct';
      }> = [...directPermissions];
      const directPermissionIds = directPermissions.map(p => p.id);
      
      rolePermissions.forEach(rolePermission => {
        if (!directPermissionIds.includes(rolePermission.id)) {
          allPermissions.push(rolePermission);
        }
      });

      return {
        role,
        permissions: allPermissions.sort((a, b) => a.name.localeCompare(b.name)),
        permissionNames: allPermissions.map(p => p.name)
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao buscar permissões do usuário:', error);
      throw new BadRequestException('Erro ao buscar permissões do usuário');
    }
  }

  /**
   * Buscar permissões detalhadas do usuário com informações extras
   */
  async getUserPermissionsDetailed(userId: string): Promise<UserPermissionsResponseDto> {
    return this.getUserPermissions(userId);
  }

  /**
   * Cria um resumo estatístico das permissões do usuário
   */
  async getUserPermissionsSummary(userId: string): Promise<UserPermissionsSummaryDto> {
    try {
      const permissionsData = await this.getUserPermissions(userId);
      
      const rolePermissions = permissionsData.permissions.filter(p => p.source === 'role');
      const directPermissions = permissionsData.permissions.filter(p => p.source === 'direct');
      
      // Extrair categorias dos nomes das permissões
      const categories = [...new Set(
        permissionsData.permissions.map(p => {
          // Extrair categoria do nome da permissão (antes do primeiro ponto)
          const parts = p.name.split('.');
          return parts.length > 1 ? parts[0] : 'Outros';
        })
      )].sort();

      return {
        role: permissionsData.role?.name || null,
        totalPermissions: permissionsData.permissions.length,
        rolePermissions: rolePermissions.length,
        directPermissions: directPermissions.length,
        categories
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao criar resumo de permissões:', error);
      throw new BadRequestException('Erro ao criar resumo de permissões');
    }
  }

  /**
   * Organiza as permissões do usuário por categorias
   */
  async getUserPermissionsCategorized(userId: string): Promise<CategorizedPermissionsDto> {
    try {
      const permissionsData = await this.getUserPermissions(userId);
      
      const categorized: CategorizedPermissionsDto = {};
      
      permissionsData.permissions.forEach(permission => {
        // Extrair categoria do nome da permissão
        const parts = permission.name.split('.');
        const category = parts.length > 1 ? parts[0] : 'Outros';
        
        if (!categorized[category]) {
          categorized[category] = [];
        }
        
        categorized[category].push(permission);
      });

      // Ordenar permissões dentro de cada categoria
      Object.keys(categorized).forEach(category => {
        categorized[category].sort((a, b) => a.name.localeCompare(b.name));
      });

      return categorized;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao categorizar permissões:', error);
      throw new BadRequestException('Erro ao categorizar permissões');
    }
  }

  /**
   * Verifica se um usuário tem uma permissão específica
   */
  async checkUserPermission(userId: string, permissionName: string): Promise<{ hasPermission: boolean }> {
    try {
      const permissionsData = await this.getUserPermissions(userId);
      const hasPermission = permissionsData.permissionNames.includes(permissionName);
      
      return { hasPermission };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao verificar permissão:', error);
      throw new BadRequestException('Erro ao verificar permissão');
    }
  }

  /**
   * Verifica múltiplas permissões do usuário
   */
  async checkUserPermissions(
    userId: string, 
    permissionNames: string[], 
    mode: 'any' | 'all' = 'any'
  ): Promise<{ hasPermissions: boolean; details: Record<string, boolean> }> {
    try {
      const permissionsData = await this.getUserPermissions(userId);
      
      const details: Record<string, boolean> = {};
      const userPermissionNames = permissionsData.permissionNames;
      
      permissionNames.forEach(permission => {
        details[permission] = userPermissionNames.includes(permission);
      });

      const hasPermissions = mode === 'any'
        ? permissionNames.some(permission => userPermissionNames.includes(permission))
        : permissionNames.every(permission => userPermissionNames.includes(permission));

      return { hasPermissions, details };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao verificar permissões:', error);
      throw new BadRequestException('Erro ao verificar permissões');
    }
  }

  /**
   * Atribui uma role para um usuário (substitui a role atual)
   * Sincroniza tanto o sistema Spatie quanto a coluna role para compatibilidade
   */
  async assignRole(userId: string, roleId: number): Promise<{ message: string; role: PapelComPermissoes }> {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: { 
          id: userId, 
          deleted_at: null 
        }
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }
      
      // Verificar se o role existe
      const role = await this.prisma.roles.findUnique({
        where: { id: BigInt(roleId) },
        include: {
          role_has_permissions: {
            include: {
              permissions: true
            }
          }
        }
      });

      if (!role) {
        throw new NotFoundException('Role não encontrado');
      }

      // Atualizar AMBOS os sistemas em uma transação
      await this.prisma.$transaction(async (tx) => {
        // 1. Sistema Spatie - remover roles existentes
        await tx.model_has_roles.deleteMany({
          where: {
            model_id: userId,
            model_type: 'App\\Models\\User'
          }
        });

        // 2. Sistema Spatie - atribuir novo role
        await tx.model_has_roles.create({
          data: {
            role_id: BigInt(roleId),
            model_id: userId,
            model_type: 'App\\Models\\User'
          }
        });

        // 3. Coluna legacy - sincronizar para compatibilidade com outra aplicação
        await tx.usuarios.update({
          where: { id: userId },
          data: { 
            role: this.mapSpatieRoleToValidDbRole(role.name),
            updated_at: new Date()
          }
        });
      });

      const roleData = {
        id: Number(role.id),
        name: role.name,
        guard_name: role.guard_name,
        permissions: role.role_has_permissions.map(rhp => ({
          id: Number(rhp.permissions.id),
          name: rhp.permissions.name,
          guard_name: rhp.permissions.guard_name
        }))
      };

      return { 
        message: `Role ${role.name} atribuído com sucesso`,
        role: roleData
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao atribuir role:', error);
      throw new BadRequestException('Erro ao atribuir role');
    }
  }

  /**
   * Atribui uma permissão direta ao usuário
   */
  async assignPermission(userId: string, permissionId: number): Promise<{ message: string; permission: PermissaoResumida }> {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: { 
          id: userId, 
          deleted_at: null 
        }
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }
      
      // Verificar se a permission existe
      const permission = await this.prisma.permissions.findUnique({
        where: { id: BigInt(permissionId) }
      });

      if (!permission) {
        throw new NotFoundException('Permissão não encontrada');
      }

      // Verificar se já tem essa permissão
      const existingPermission = await this.prisma.model_has_permissions.findFirst({
        where: {
          permission_id: BigInt(permissionId),
          model_id: userId,
          model_type: 'App\\Models\\User'
        }
      });

      if (existingPermission) {
        throw new ConflictException('Usuário já possui esta permissão');
      }

      // Atribuir permissão
      await this.prisma.model_has_permissions.create({
        data: {
          permission_id: BigInt(permissionId),
          model_id: userId,
          model_type: 'App\\Models\\User'
        }
      });

      const permissionData = {
        id: Number(permission.id),
        name: permission.name,
        guard_name: permission.guard_name
      };

      return { 
        message: `Permissão ${permission.name} atribuída com sucesso`,
        permission: permissionData
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      console.error('Erro ao atribuir permissão:', error);
      throw new BadRequestException('Erro ao atribuir permissão');
    }
  }

  /**
   * Remove uma permissão direta do usuário
   */
  async removePermission(userId: string, permissionId: number): Promise<{ message: string }> {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: { 
          id: userId, 
          deleted_at: null 
        }
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }
      
      // Verificar se a permission existe
      const permission = await this.prisma.permissions.findUnique({
        where: { id: BigInt(permissionId) }
      });

      if (!permission) {
        throw new NotFoundException('Permissão não encontrada');
      }

      // Remover permissão
      const deleted = await this.prisma.model_has_permissions.deleteMany({
        where: {
          permission_id: BigInt(permissionId),
          model_id: userId,
          model_type: 'App\\Models\\User'
        }
      });

      if (deleted.count === 0) {
        throw new NotFoundException('Usuário não possui esta permissão');
      }

      return { message: `Permissão ${permission.name} removida com sucesso` };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao remover permissão:', error);
      throw new BadRequestException('Erro ao remover permissão');
    }
  }

  /**
   * Sincroniza permissões diretas do usuário (substitui todas)
   */
  async syncUserPermissions(userId: string, permissionIds: number[]): Promise<{ message: string; permissions: PermissaoResumida[] }> {
    try {
      const usuario = await this.prisma.usuarios.findFirst({
        where: { 
          id: userId, 
          deleted_at: null 
        }
      });

      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado');
      }

      // Verificar se todas as permissões existem
      const permissions = await this.prisma.permissions.findMany({
        where: {
          id: { in: permissionIds.map(id => BigInt(id)) }
        }
      });

      if (permissions.length !== permissionIds.length) {
        const foundIds = permissions.map(p => Number(p.id));
        const missingIds = permissionIds.filter(id => !foundIds.includes(id));
        throw new BadRequestException(`Permissões não encontradas: ${missingIds.join(', ')}`);
      }

      // Remover todas as permissões diretas atuais
      await this.prisma.model_has_permissions.deleteMany({
        where: {
          model_id: userId,
          model_type: 'App\\Models\\User'
        }
      });

      // Adicionar as novas permissões
      let newPermissions: PermissaoResumida[] = [];
      if (permissionIds.length > 0) {
        await this.prisma.model_has_permissions.createMany({
          data: permissionIds.map(permissionId => ({
            permission_id: BigInt(permissionId),
            model_id: userId,
            model_type: 'App\\Models\\User'
          }))
        });

        // Formatar permissões para resposta
        newPermissions = permissions.map(p => ({
          id: Number(p.id),
          name: p.name,
          guard_name: p.guard_name
        }));
      }

      return { 
        message: 'Permissões sincronizadas com sucesso',
        permissions: newPermissions
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Erro ao sincronizar permissões:', error);
      throw new BadRequestException('Erro ao sincronizar permissões');
    }
  }

  async bulkAssignRoles(bulkData: BulkAssignRolesDto, solicitante: Solicitante): Promise<{ success: number; failures: FalhaDoLote[] }> {
    let success = 0;
    const failures: FalhaDoLote[] = [];

    for (const assignment of bulkData.assignments) {
      try {
        await this.atribuirPapel(assignment.userId, assignment.roleId, solicitante);
        success++;
      } catch (error) {
        failures.push({
          userId: assignment.userId,
          roleId: assignment.roleId,
          error: error.message
        });
      }
    }

    return { success, failures };
  }

  async bulkAssignPermissions(bulkData: BulkAssignPermissionsDto, solicitante: Solicitante): Promise<{ success: number; failures: FalhaDoLote[] }> {
    let success = 0;
    const failures: FalhaDoLote[] = [];

    for (const assignment of bulkData.assignments) {
      try {
        await this.sincronizarPermissoesDiretas(assignment.userId, assignment.permissionIds, solicitante);
        success++;
      } catch (error) {
        failures.push({
          userId: assignment.userId,
          permissionIds: assignment.permissionIds,
          error: error.message
        });
      }
    }

    return { success, failures };
  }

  // ============================================================================
  // ROTAS PRÓPRIAS DE PAPEL E PERMISSÃO DIRETA — com a hierarquia
  // ============================================================================

  /** POST :id/assign-role. */
  async atribuirPapel(userId: string, roleId: number, solicitante: Solicitante) {
    if (mesmoUsuario(solicitante.id, userId)) {
      throw new ForbiddenException('Você não pode mudar o próprio tipo de usuário.');
    }
    await this.exigirPodeGerenciar(solicitante, userId);
    const papel = await this.prisma.roles.findUnique({ where: { id: BigInt(roleId) } });
    if (!papel) throw new NotFoundException('Role não encontrado');
    await this.exigirPodeLidarComPapel(solicitante, papel.name, 'dar o tipo');
    return this.assignRole(userId, roleId);
  }

  /** POST :id/sync-permissions: a lista completa das diretas (só o que o papel não dá é gravado). */
  async sincronizarPermissoesDiretas(userId: string, permissionIds: number[], solicitante: Solicitante) {
    await this.exigirPodeMexerNasDiretas(solicitante, userId);
    const papel = await this.vinculoDePapel(userId);
    const extras = await this.semAsDoPapel(await this.permissoesPorId(permissionIds), papel?.id ?? null);
    const atuais = new Set((await this.diretasDe(userId)).map((p) => p.name));
    this.exigirPodeDarExtras(solicitante, extras.filter((p) => !atuais.has(p.name)).map((p) => p.name));
    return this.syncUserPermissions(userId, extras.map((p) => Number(p.id)));
  }

  /** POST :id/assign-permission. */
  async atribuirPermissao(userId: string, permissionId: number, solicitante: Solicitante) {
    await this.exigirPodeMexerNasDiretas(solicitante, userId);
    const [permissao] = await this.permissoesPorId([permissionId]);
    this.exigirPodeDarExtras(solicitante, [permissao.name]);
    return this.assignPermission(userId, permissionId);
  }

  /** DELETE :id/remove-permission/:permissionId — tirar não exige ter a permissão. */
  async removerPermissao(userId: string, permissionId: number, solicitante: Solicitante) {
    await this.exigirPodeMexerNasDiretas(solicitante, userId);
    return this.removePermission(userId, permissionId);
  }

  // ============================================================================
  // HIERARQUIA DE PAPÉIS — a regra está em hierarquia-de-papeis.ts
  // ============================================================================

  private papelPorNome(nome: string) {
    return this.prisma.roles.findFirst({ where: { name: nome }, orderBy: { id: 'asc' } });
  }

  /** O papel pedido no payload, pelo id ou pelo nome (legado). `null` = não pediu. */
  private async papelPedido(data: { roleId?: number; roleNames?: string[] }): Promise<roles | null> {
    if (data.roleId) {
      const papel = await this.prisma.roles.findUnique({ where: { id: BigInt(data.roleId) } });
      if (!papel) throw new BadRequestException('Tipo de usuário não encontrado.');
      return papel;
    }
    const nome = data.roleNames?.[0]?.trim();
    if (!nome) return null;
    const papel = await this.papelPorNome(nome);
    if (!papel) throw new BadRequestException(`Não existe o tipo de usuário "${nome}".`);
    return papel;
  }

  /** O papel do Spatie de quem já existe. */
  private async vinculoDePapel(userId: string): Promise<roles | null> {
    const vinculo = await this.prisma.model_has_roles.findFirst({
      where: { model_id: userId, model_type: MODEL_TYPE },
      include: { roles: true },
    });
    return vinculo?.roles ?? null;
  }

  /** O papel que vale para a hierarquia: o do Spatie e, sem ele, a coluna legada. */
  private async papelParaHierarquia(userId: string): Promise<string | null> {
    const vinculo = await this.vinculoDePapel(userId);
    if (vinculo) return vinculo.name;
    const usuario = await this.prisma.usuarios.findUnique({ where: { id: userId }, select: { role: true } });
    return usuario?.role?.trim() || null;
  }

  /**
   * Por que o solicitante não pode lidar com o papel, ou `null` se pode. Pública
   * para a importação por planilha dar o mesmo motivo, na coluna TIPO.
   */
  async motivoParaNaoLidarComPapel(solicitante: Solicitante, papel: string | null, acao: string): Promise<string | null> {
    if (solicitante.role === PAPEL_TOPO) return null;
    const temPropria = papel
      ? !!(await this.prisma.permissions.findFirst({ where: { name: permissaoDoPapel(papel) }, select: { id: true } }))
      : false;
    if (podeLidarComPapel(solicitante, papel, temPropria)) return null;

    const requer = papel === PAPEL_TOPO ? 'ser super_admin' : papel && temPropria ? permissaoDoPapel(papel) : 'usuarios.manage';
    return `Você não pode ${acao} "${papel ?? 'sem tipo'}". Requer: ${requer}.`;
  }

  private async exigirPodeLidarComPapel(solicitante: Solicitante, papel: string | null, acao: string) {
    const motivo = await this.motivoParaNaoLidarComPapel(solicitante, papel, acao);
    if (motivo) throw new ForbiddenException(motivo);
  }

  /** Mexer em outra pessoa exige poder lidar com o papel que ela tem hoje. */
  private async exigirPodeGerenciar(solicitante: Solicitante, alvoId: string) {
    if (solicitante.role === PAPEL_TOPO) return;
    await this.exigirPodeLidarComPapel(solicitante, await this.papelParaHierarquia(alvoId), 'alterar usuário do tipo');
  }

  private async exigirPodeMexerNasDiretas(solicitante: Solicitante, userId: string) {
    if (mesmoUsuario(solicitante.id, userId)) {
      throw new ForbiddenException('Você não pode mudar as próprias permissões.');
    }
    await this.exigirPodeGerenciar(solicitante, userId);
  }

  private exigirPodeDarExtras(solicitante: Solicitante, novas: string[]) {
    const negadas = extrasQueNaoPodeDar(solicitante, novas);
    if (negadas.length > 0) {
      throw new ForbiddenException(`Você não pode dar estas permissões diretas: ${negadas.join(', ')}.`);
    }
  }

  /** As permissões pedidas no payload, por id ou por nome. `null` = não pediu. */
  private async permissoesPedidas(data: { permissionIds?: number[]; permissions?: string[] }) {
    if (Array.isArray(data.permissionIds)) return this.permissoesPorId(data.permissionIds);
    if (Array.isArray(data.permissions)) return this.permissoesPorNome(data.permissions);
    return null;
  }

  private async permissoesPorId(ids: number[]): Promise<PermissaoMinima[]> {
    const achadas = await this.prisma.permissions.findMany({
      where: { id: { in: ids.map((id) => BigInt(id)) } },
      select: { id: true, name: true },
    });
    const faltam = ids.filter((id) => !achadas.some((p) => Number(p.id) === id));
    if (faltam.length > 0) throw new BadRequestException(`Permissões não encontradas: ${faltam.join(', ')}`);
    return achadas;
  }

  /** Cada nome no primeiro id que tem esse nome (há nomes repetidos entre guards). */
  private async permissoesPorNome(nomes: string[]): Promise<PermissaoMinima[]> {
    const achadas = await this.prisma.permissions.findMany({
      where: { name: { in: nomes } },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    const primeira = new Map<string, PermissaoMinima>();
    for (const p of achadas) if (!primeira.has(p.name)) primeira.set(p.name, p);
    const faltam = nomes.filter((n) => !primeira.has(n));
    if (faltam.length > 0) throw new BadRequestException(`Permissões não encontradas: ${faltam.join(', ')}`);
    return [...primeira.values()];
  }

  /** Só o que o papel não dá, uma vez por nome. */
  private async semAsDoPapel(permissoes: PermissaoMinima[], papelId: bigint | null): Promise<PermissaoMinima[]> {
    const doPapel = papelId
      ? await this.prisma.role_has_permissions.findMany({
          where: { role_id: papelId },
          select: { permissions: { select: { name: true } } },
        })
      : [];
    const vistas = new Set(doPapel.map((p) => p.permissions.name));
    return permissoes.filter((p) => {
      if (vistas.has(p.name)) return false;
      vistas.add(p.name);
      return true;
    });
  }

  private async diretasDe(userId: string): Promise<PermissaoMinima[]> {
    const diretas = await this.prisma.model_has_permissions.findMany({
      where: { model_id: userId, model_type: MODEL_TYPE },
      select: { permissions: { select: { id: true, name: true } } },
    });
    return diretas.map((d) => d.permissions);
  }

  async getAllAvailableRoles() {
    try {
      return await this.rolesService.findAll();
    } catch (error) {
      console.error('Erro ao buscar roles disponíveis:', error);
      throw new BadRequestException('Erro ao buscar roles disponíveis');
    }
  }

  async getAllAvailablePermissions() {
    try {
      return await this.permissionsService.findAll();
    } catch (error) {
      console.error('Erro ao buscar permissões disponíveis:', error);
      throw new BadRequestException('Erro ao buscar permissões disponíveis');
    }
  }

  async getAvailablePermissionsGrouped() {
    try {
      return await this.permissionsService.findGrouped();
    } catch (error) {
      console.error('Erro ao buscar permissões agrupadas:', error);
      throw new BadRequestException('Erro ao buscar permissões agrupadas');
    }
  }

  /**
   * Método auxiliar para migrar usuários existentes do sistema legacy para Spatie
   * Use apenas quando necessário para sincronização de dados
   */
  async syncLegacyRolesToSpatie(): Promise<{ migrated: number; errors: FalhaDoLote[] }> {
    try {
      let migrated = 0;
      const errors: FalhaDoLote[] = [];

      // Buscar usuários que têm role na coluna mas não no sistema Spatie
      const usuariosComRole = await this.prisma.usuarios.findMany({
        where: {
          role: { not: null },
          deleted_at: null,
          is_active: true
        }
      });

      for (const usuario of usuariosComRole) {
        try {
          // Verificar se já tem role no sistema Spatie
          const existingSpatie = await this.prisma.model_has_roles.findFirst({
            where: {
              model_id: usuario.id,
              model_type: 'App\\Models\\User'
            }
          });

          if (!existingSpatie && usuario.role) {
            // Buscar a role pelo nome
            const role = await this.prisma.roles.findFirst({
              where: { name: usuario.role }
            });

            if (role) {
              // Criar associação no sistema Spatie
              await this.prisma.model_has_roles.create({
                data: {
                  role_id: role.id,
                  model_id: usuario.id,
                  model_type: 'App\\Models\\User'
                }
              });
              migrated++;
            } else {
              errors.push({
                userId: usuario.id,
                error: `Role '${usuario.role}' não encontrada na tabela roles`
              });
            }
          }
        } catch (error) {
          errors.push({
            userId: usuario.id,
            error: error.message
          });
        }
      }

      return { migrated, errors };
    } catch (error) {
      console.error('Erro na sincronização legacy -> Spatie:', error);
      throw new BadRequestException('Erro na sincronização de roles');
    }
  }

  // ============================================================================
  // MÉTODOS AUXILIARES PARA CONSTRAINT DE ROLE
  // ============================================================================

  /**
   * Retorna o nome da role do Spatie diretamente para a coluna role
   * NOTA: A constraint CHECK foi removida em 2025-12-09, então agora a coluna aceita qualquer valor
   * Mantido para compatibilidade com aplicação legacy, mas não faz mais mapeamento
   */
  private mapSpatieRoleToValidDbRole(spatieRoleName: string): string {
    if (!spatieRoleName) return 'vendedor'; // fallback seguro apenas se NULL

    // ✅ ATUALIZADO: Constraint CHECK foi removida, retornar o valor original
    return spatieRoleName;
  }

  // ============================================================================
  // MÉTODOS AUXILIARES
  // ============================================================================

  private async mapToUsuarioResponseDtoOptimized(usuario: usuarios): Promise<UsuarioResponseDto> {
    // ✅ SIMPLIFICADO: Usar apenas a coluna role da tabela usuarios
    const role = usuario.role || 'vendedor'; // Default apenas se NULL

    return {
      id: usuario.id,
      status: usuario.status as UsuarioStatus,
      concessionaria_atual_id: usuario.concessionaria_atual_id,
      organizacao_atual: usuario.organizacao_atual_id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      instagram: usuario.instagram,
      cpf_cnpj: usuario.cpf_cnpj,
      cidade: usuario.cidade,
      estado: usuario.estado,
      endereco: usuario.endereco,
      cep: usuario.cep,
      manager_id: usuario.manager_id,
      avatar_url: usuario.avatar_url,
      role: role, // ← Campo role direto
      all_permissions: [],
      roles: [role], // ← Array com a role para compatibilidade
      created_at: usuario.created_at,
      updated_at: usuario.updated_at,
    };
  }

  private async mapToUsuarioResponseDto(usuario: usuarios): Promise<UsuarioResponseDto> {
    try {
      // Buscar permissões e roles do usuário de forma mais robusta
      const userPermissions = await this.getUserPermissions(usuario.id).catch((error) => {
        console.error(`Erro ao buscar permissions para usuário ${usuario.id}:`, error);
        return {
          role: null,
          permissions: [],
          permissionNames: []
        };
      });

      // Garantir que all_permissions seja um array de objetos corretos
      const allPermissions = userPermissions.permissions || [];

      return {
        id: usuario.id,
        status: usuario.status as UsuarioStatus,
        concessionaria_atual_id: usuario.concessionaria_atual_id,
        organizacao_atual: usuario.organizacao_atual_id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        instagram: usuario.instagram,
        cpf_cnpj: usuario.cpf_cnpj,
        cidade: usuario.cidade,
        estado: usuario.estado,
        endereco: usuario.endereco,
        cep: usuario.cep,
        manager_id: usuario.manager_id,
        avatar_url: usuario.avatar_url, // ← ADICIONADO
        deve_trocar_senha: !!usuario.deve_trocar_senha,
        all_permissions: allPermissions, // Array de objetos com id, name, guard_name, source
        roles: userPermissions.role ? [userPermissions.role] : [], // ✅ CORRIGIDO: retornar objeto completo
        role_details: userPermissions.role || undefined,
        created_at: usuario.created_at,
        updated_at: usuario.updated_at,
      };
    } catch (error) {
      console.error('Erro crítico no mapeamento do usuário:', error);
      // Fallback para dados básicos se algo der errado
      return {
        id: usuario.id,
        status: usuario.status as UsuarioStatus,
        concessionaria_atual_id: usuario.concessionaria_atual_id,
        organizacao_atual: usuario.organizacao_atual_id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        instagram: usuario.instagram,
        cpf_cnpj: usuario.cpf_cnpj,
        cidade: usuario.cidade,
        estado: usuario.estado,
        endereco: usuario.endereco,
        cep: usuario.cep,
        manager_id: usuario.manager_id,
        avatar_url: usuario.avatar_url, // ← ADICIONADO
        all_permissions: [], // Array vazio em caso de erro
        roles: [],
        role_details: undefined,
        created_at: usuario.created_at,
        updated_at: usuario.updated_at,
      };
    }
  }
}
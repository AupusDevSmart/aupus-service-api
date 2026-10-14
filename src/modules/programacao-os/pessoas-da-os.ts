import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@/core';
import { PAPEIS } from '@/core/modules/permissions/matriz-de-permissoes';

/**
 * Quem pode ser responsável ou técnico de uma programação/OS (SN-31).
 *
 * Antes eram texto livre: ninguém era avisado, nada contava hora de ninguém e o
 * mesmo técnico aparecia com três grafias. Agora é sempre um usuário, e o nome
 * gravado é o do cadastro (o texto que vem da tela é ignorado).
 *
 * - **Equipe da planta**: técnicos de campo (`operador`) vinculados à planta
 *   (`planta_operadores`). O vínculo é o mesmo que dá a eles o escopo: quem está
 *   na equipe enxerga as OS da planta, e só quem enxerga pode ser escalado.
 * - **Apoio**: papéis que enxergam todas as plantas (planejador, gerente,
 *   administrador) — podem ser responsáveis ou ir a campo em qualquer planta.
 * - Cliente (`proprietario`) nunca: ele acompanha, não executa.
 */
export interface PessoaQuePodeAtuar {
  id: string;
  nome: string;
  email: string | null;
  papel: string;
}

export interface PessoasDaPlanta {
  equipe: PessoaQuePodeAtuar[];
  apoio: PessoaQuePodeAtuar[];
}

/** Serve o PrismaService e o cliente de dentro de uma transação. */
type Leitor = Pick<Prisma.TransactionClient, '$queryRaw'>;

const MODEL_TYPE = 'App\\Models\\User';
const PAPEL_DA_EQUIPE = 'operador';
const PAPEL_CLIENTE = 'proprietario';
const PAPEIS_DE_APOIO = new Set(
  PAPEIS.map((p) => p.name).filter((nome) => nome !== PAPEL_DA_EQUIPE && nome !== PAPEL_CLIENTE),
);

interface Linha {
  id: string;
  nome: string;
  email: string | null;
  papel: string | null;
  ativo: boolean;
  na_planta: boolean;
}

/**
 * Uma linha por usuário, com o papel e se ele está na equipe da planta. SQL cru
 * com `trim()` dos dois lados: `model_has_roles.model_id` e `planta_operadores`
 * são Char(26) e os ids antigos têm 25 caracteres.
 */
async function lerPessoas(prisma: Leitor, plantaId: string | null, ids?: string[]): Promise<Linha[]> {
  const filtroIds = ids ? Prisma.sql`AND trim(u.id) IN (${Prisma.join(ids)})` : Prisma.empty;
  const somenteAtivos = ids ? Prisma.empty : Prisma.sql`AND u.deleted_at IS NULL AND u.is_active AND u.status = 'Ativo'`;
  return prisma.$queryRaw<Linha[]>`
    SELECT DISTINCT ON (trim(u.id))
      trim(u.id) AS id,
      u.nome,
      u.email,
      r.name AS papel,
      (u.deleted_at IS NULL AND u.is_active AND u.status = 'Ativo') AS ativo,
      EXISTS (
        SELECT 1 FROM planta_operadores po
        WHERE trim(po.usuario_id) = trim(u.id) AND trim(po.planta_id) = ${plantaId}
      ) AS na_planta
    FROM usuarios u
    LEFT JOIN model_has_roles mr ON trim(mr.model_id) = trim(u.id) AND mr.model_type = ${MODEL_TYPE}
    LEFT JOIN roles r ON r.id = mr.role_id
    WHERE 1 = 1 ${somenteAtivos} ${filtroIds}
    ORDER BY trim(u.id), r.id
  `;
}

const daEquipe = (l: Linha) => l.papel === PAPEL_DA_EQUIPE && l.na_planta;
const deApoio = (l: Linha) => !!l.papel && PAPEIS_DE_APOIO.has(l.papel);
const pessoa = ({ id, nome, email, papel }: Linha): PessoaQuePodeAtuar => ({ id, nome, email, papel: papel ?? '' });
const porNome = (a: PessoaQuePodeAtuar, b: PessoaQuePodeAtuar) => a.nome.localeCompare(b.nome, 'pt-BR');

/** As opções da tela: a equipe da planta primeiro, depois o apoio. */
export async function pessoasQuePodemAtuar(
  prisma: Leitor,
  plantaId: string | null | undefined,
): Promise<PessoasDaPlanta> {
  const linhas = await lerPessoas(prisma, plantaId?.trim() || null);
  return {
    equipe: linhas.filter(daEquipe).map(pessoa).sort(porNome),
    apoio: linhas.filter(deApoio).map(pessoa).sort(porNome),
  };
}

function motivoDaRecusa(linha: Linha | undefined, id: string, plantaId: string | null): string | null {
  if (!linha) return `Usuário ${id} não encontrado.`;
  if (!linha.ativo) return `${linha.nome} está inativo e não pode ser escalado.`;
  if (linha.papel === PAPEL_CLIENTE) return `${linha.nome} é cliente: não pode ser responsável nem técnico de OS.`;
  if (linha.papel === PAPEL_DA_EQUIPE) {
    if (linha.na_planta) return null;
    return plantaId
      ? `${linha.nome} não está na equipe desta planta. Inclua-o na equipe, no cadastro da planta.`
      : `${linha.nome} é técnico de campo e a programação não tem planta: escolha a planta antes de escalá-lo.`;
  }
  return deApoio(linha) ? null : `${linha.nome} não tem um tipo de usuário que atue em OS.`;
}

/**
 * Confere cada id (responsável e técnicos) contra a mesma regra da tela e
 * devolve o nome do cadastro de cada um. Recusa tudo de uma vez, com o motivo de
 * cada pessoa, para a tela mostrar numa mensagem só.
 */
export async function garantirPessoasQuePodemAtuar(
  prisma: Leitor,
  plantaId: string | null | undefined,
  ids: string[],
): Promise<Map<string, PessoaQuePodeAtuar>> {
  const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const planta = plantaId?.trim() || null;
  if (unicos.length === 0) return new Map();

  const linhas = await lerPessoas(prisma, planta, unicos);
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const recusas = unicos.map((id) => motivoDaRecusa(porId.get(id), id, planta)).filter((m): m is string => !!m);
  if (recusas.length > 0) throw new BadRequestException(recusas.join(' '));

  return new Map(unicos.map((id) => [id, pessoa(porId.get(id)!)]));
}

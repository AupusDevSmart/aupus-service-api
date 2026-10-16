import { Prisma } from '@prisma/client';
import type { PrismaService } from '@/core';
import { origemDaProgramacao } from '../../common/helpers/status-da-origem';
import type { Entidade, Envolvido, Registro } from './catalogo';
import { PAPEIS_DA_EQUIPE } from '@/core/modules/permissions/matriz-de-permissoes';

const MODEL_TYPE = 'App\\Models\\User';

/** A descrição numa linha, curta: é o que cabe no sininho e no assunto do e-mail. */
function resumo(texto: string | null | undefined, maximo = 140): string {
  const linha = (texto ?? '').replace(/\s+/g, ' ').trim();
  return linha.length > maximo ? `${linha.slice(0, maximo - 1)}…` : linha;
}

const semNada = (): Record<Envolvido, string[]> => ({ responsavel: [], tecnicos: [], criador: [], autor_origem: [], cliente: [] });
const ids = (...valores: (string | null | undefined)[]) => valores.map((v) => v?.trim()).filter((v): v is string => !!v);

async function donoDaPlanta(prisma: PrismaService, plantaId: string | null): Promise<string[]> {
  if (!plantaId) return [];
  const planta = await prisma.plantas.findFirst({ where: { id: plantaId.trim() }, select: { proprietario_id: true } });
  return ids(planta?.proprietario_id);
}

/** Quem abriu a origem: o autor da anomalia ou quem pediu a solicitação. */
async function autoresDaOrigem(prisma: PrismaService, origem: { anomaliaId: string | null; solicitacaoId: string | null }): Promise<string[]> {
  const autores: string[] = [];
  if (origem.anomaliaId) {
    const a = await prisma.anomalias.findFirst({ where: { id: origem.anomaliaId }, select: { usuario_id: true } });
    autores.push(...ids(a?.usuario_id));
  }
  if (origem.solicitacaoId) {
    const s = await prisma.solicitacoes_servico.findFirst({ where: { id: origem.solicitacaoId }, select: { solicitante_id: true } });
    autores.push(...ids(s?.solicitante_id));
  }
  return autores;
}

async function daProgramacao(prisma: PrismaService, id: string): Promise<Registro | null> {
  const p = await prisma.programacoes_os.findFirst({
    where: { id },
    select: {
      id: true, codigo: true, descricao: true, status: true, planta_id: true, responsavel_id: true, criado_por_id: true,
      anomalia_id: true, solicitacao_servico_id: true, dados_origem: true,
    },
  });
  if (!p) return null;
  const tecnicos = await prisma.tecnicos_programacao_os.findMany({ where: { programacao_id: p.id }, select: { tecnico_id: true } });
  // Aprovada, o que interessa é a OS que nasceu dela
  const os = p.status === 'PENDENTE' ? null : await prisma.ordens_servico.findFirst({ where: { programacao_id: p.id }, select: { id: true } });
  return {
    entidade: 'programacao_os', id: p.id.trim(), plantaId: p.planta_id?.trim() || null,
    rotulo: `Programação ${p.codigo}`, resumo: resumo(p.descricao),
    link: os ? `/execucao-os?execucaoId=${os.id.trim()}` : `/programacao-os?programacaoId=${p.id.trim()}`,
    pessoas: {
      ...semNada(),
      responsavel: ids(p.responsavel_id), criador: ids(p.criado_por_id), tecnicos: ids(...tecnicos.map((t) => t.tecnico_id)),
      autor_origem: await autoresDaOrigem(prisma, origemDaProgramacao(p)),
      cliente: await donoDaPlanta(prisma, p.planta_id),
    },
  };
}

async function daOS(prisma: PrismaService, id: string): Promise<Registro | null> {
  const os = await prisma.ordens_servico.findFirst({
    where: { id },
    select: { id: true, numero_os: true, descricao: true, planta_id: true, responsavel_id: true, criado_por_id: true, programacao_id: true },
  });
  if (!os) return null;
  const tecnicos = await prisma.tecnicos_os.findMany({ where: { os_id: os.id }, select: { tecnico_id: true } });
  const programacao = await prisma.programacoes_os.findFirst({
    where: { id: os.programacao_id },
    select: { anomalia_id: true, solicitacao_servico_id: true, dados_origem: true },
  });
  return {
    entidade: 'ordem_servico', id: os.id.trim(), plantaId: os.planta_id?.trim() || null,
    rotulo: `OS ${os.numero_os}`, resumo: resumo(os.descricao),
    link: `/execucao-os?execucaoId=${os.id.trim()}`,
    pessoas: {
      ...semNada(),
      responsavel: ids(os.responsavel_id), criador: ids(os.criado_por_id), tecnicos: ids(...tecnicos.map((t) => t.tecnico_id)),
      autor_origem: programacao ? await autoresDaOrigem(prisma, origemDaProgramacao(programacao)) : [],
      cliente: await donoDaPlanta(prisma, os.planta_id),
    },
  };
}

async function daAnomalia(prisma: PrismaService, id: string): Promise<Registro | null> {
  const a = await prisma.anomalias.findFirst({ where: { id }, select: { id: true, numero: true, descricao: true, planta_id: true, usuario_id: true } });
  if (!a) return null;
  return {
    entidade: 'anomalia', id: a.id.trim(), plantaId: a.planta_id?.trim() || null,
    // A anomalia muitas vezes não tem número: o resumo diz qual é
    rotulo: a.numero?.trim() ? `Anomalia ${a.numero.trim()}` : 'Anomalia', resumo: resumo(a.descricao),
    link: `/anomalias?anomaliaId=${a.id.trim()}`,
    pessoas: { ...semNada(), criador: ids(a.usuario_id), cliente: await donoDaPlanta(prisma, a.planta_id) },
  };
}

async function daSolicitacao(prisma: PrismaService, id: string): Promise<Registro | null> {
  const s = await prisma.solicitacoes_servico.findFirst({ where: { id }, select: { id: true, numero: true, titulo: true, planta_id: true, solicitante_id: true } });
  if (!s) return null;
  return {
    entidade: 'solicitacao_servico', id: s.id.trim(), plantaId: s.planta_id?.trim() || null,
    rotulo: `Solicitação ${s.numero}`, resumo: resumo(s.titulo),
    link: `/solicitacoes-servico?solicitacaoId=${s.id.trim()}`,
    pessoas: { ...semNada(), criador: ids(s.solicitante_id), cliente: await donoDaPlanta(prisma, s.planta_id) },
  };
}

const LEITORES: Record<Entidade, (prisma: PrismaService, id: string) => Promise<Registro | null>> = {
  programacao_os: daProgramacao,
  ordem_servico: daOS,
  anomalia: daAnomalia,
  solicitacao_servico: daSolicitacao,
};

/** O registro do evento como está agora; null se ele não existe mais. */
export function lerRegistro(prisma: PrismaService, entidade: string, id: string): Promise<Registro | null> {
  const leitor = LEITORES[entidade as Entidade];
  return leitor ? leitor(prisma, id.trim()) : Promise.resolve(null);
}

/**
 * Quem recebe (SN-47): quem tem `permissao` OU está entre os `envolvidos`, e
 * nos dois casos só quem enxerga a planta — o técnico pelas plantas que opera,
 * o cliente pelas de que é dono, os outros papéis em todas (a mesma regra do
 * PermissionScopeService). Só conta ativa; nunca quem causou. Papel e permissão
 * seguem o getUserPermissions: o papel de menor id (com mais de um, dado
 * legado) e as permissões dele mais as diretas, pelo nome.
 */
export async function destinatarios(
  prisma: PrismaService,
  alvo: { permissao?: string; envolvidos: string[]; plantaId: string | null; atorId: string | null; soEquipe?: boolean },
): Promise<{ id: string; email: string | null }[]> {
  const envolvidos = [...new Set(alvo.envolvidos.map((i) => i.trim()).filter(Boolean))];
  if (!alvo.permissao && envolvidos.length === 0) return [];

  const porEnvolvimento = envolvidos.length ? Prisma.sql`trim(u.id) IN (${Prisma.join(envolvidos)})` : Prisma.sql`false`;
  // A permissão vem do papel que vale (o de menor id, como no getUserPermissions)
  // ou direta: um segundo papel legado não dá aviso de ação que a tela não deixa fazer
  const porPermissao = alvo.permissao
    ? Prisma.sql`(
        EXISTS (SELECT 1 FROM role_has_permissions rp
                JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = papel.id AND p.name = ${alvo.permissao})
        OR EXISTS (SELECT 1 FROM model_has_permissions mp
                   JOIN permissions p ON p.id = mp.permission_id
                   WHERE trim(mp.model_id) = trim(u.id) AND mp.model_type = ${MODEL_TYPE} AND p.name = ${alvo.permissao})
      )`
    : Prisma.sql`false`;
  const planta = alvo.plantaId?.trim() ?? '';
  const soEquipe = alvo.soEquipe ? Prisma.sql`AND papel.name IN (${Prisma.join([...PAPEIS_DA_EQUIPE])})` : Prisma.empty;

  return prisma.$queryRaw<{ id: string; email: string | null }[]>`
    SELECT trim(u.id) AS id, u.email
    FROM usuarios u
    LEFT JOIN LATERAL (
      SELECT r.id, r.name FROM model_has_roles mr JOIN roles r ON r.id = mr.role_id
      WHERE trim(mr.model_id) = trim(u.id) AND mr.model_type = ${MODEL_TYPE}
      ORDER BY r.id LIMIT 1
    ) papel ON true
    WHERE u.deleted_at IS NULL AND u.status = 'Ativo' AND coalesce(u.is_active, false)
      AND trim(u.id) <> ${alvo.atorId?.trim() ?? ''}
      AND (${porEnvolvimento} OR ${porPermissao})
      ${soEquipe}
      AND (
        papel.name IS NULL OR papel.name NOT IN ('operador', 'proprietario')
        OR (papel.name = 'operador' AND EXISTS (
              SELECT 1 FROM planta_operadores po WHERE trim(po.usuario_id) = trim(u.id) AND trim(po.planta_id) = ${planta}))
        OR (papel.name = 'proprietario' AND EXISTS (
              SELECT 1 FROM plantas pl WHERE trim(pl.proprietario_id) = trim(u.id) AND trim(pl.id) = ${planta} AND pl.deleted_at IS NULL))
      )
    ORDER BY 1`;
}

/**
 * Seed do banco de desenvolvimento (SN-70): apaga os dados operacionais do dev
 * e recria um ano de manutenção de cinco clientes, pelos services de verdade.
 *
 *   pnpm seed:dev                          prévia: roda tudo e desfaz no fim
 *   pnpm seed:dev --aplicar --backup=<f>   grava (exige o backup de agora)
 *   pnpm seed:dev --senhas                 só a senha das pessoas do seed (SEED_SENHA)
 *
 * Só no aupus_local ou no aupus_test, com o Postgres local e a API parada.
 * Tudo numa transação: falhou, nada fica. Nada vai ao NexOn
 * (`sincronizacao.replicando = on`; o seed confere o outbox no fim) e nenhum
 * e-mail sai (o seed descarta os efeitos de fora do banco e deixa a fila de
 * e-mail desligada). A senha das pessoas do seed vem de SEED_SENHA (ambiente ou
 * .env), nunca do repositório; sem ela, cada uma fica com a provisória aleatória.
 *
 * Regras e decisões em `.claude/skills/seed-dev/SKILL.md`.
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '@/core';
import { TransacaoEmCurso } from '@/core/prisma/transacao-em-curso';
import { ResetPasswordDto } from '@/core/modules/usuarios/dto/reset-password.dto';
import { bancoDoAmbiente, exigirApiParada, exigirBackup, exigirBancoConectado, lerOpcoes, montarServicos, validar } from './ambiente';
import { apagarDadosDoDev, contar, DOMINIO_DO_SEED, TABELAS_CONTADAS } from './apagar';
import { apagarFotosOrfasDoSeed, apagarOsNovos, arquivosDeUpload, lerDoEnv } from './arquivos';
import type { Cenario } from './cenario';
import { Relogio } from './relogio';
import { Sorteio } from './sorteio';
import { as, somarDias } from './tempo';
import { corrigirCatalogo, criarAgenda, criarFrota, criarPessoas, criarPlantas } from './etapas/cadastros';
import { criarEquipamentos } from './etapas/equipamentos';
import { contarOAno } from './etapas/historia';
import { regravarCodigos } from './etapas/ordens';
import { criarInstrucoes, criarPlanos, criarRecursos } from './etapas/planos';
import { conferirCenario } from './conferencia';

const SEMENTE = 70;
/** Uma hora: o ano inteiro roda numa transação só */
const TEMPO_DA_TRANSACAO = 60 * 60 * 1000;

class Desfazer extends Error {}

const log = (linha: string) => process.stdout.write(`${linha}\n`);
// Alguns services ainda escrevem depuração com console.log (o payload inteiro
// do cadastro): o relatório do seed sai pelo stdout direto, e o resto se cala
console.log = () => undefined;
console.info = () => undefined;
// O log de cada passo dos services (o gerador fala três linhas por madrugada) some; aviso e erro ficam
Logger.overrideLogger(['error', 'warn']);

/** Numa transação, como o seed: troca as senhas todas ou nenhuma, e nada vira evento para o NexOn */
async function trocarSenhas(prisma: PrismaService): Promise<void> {
  const senha = process.env.SEED_SENHA;
  if (!senha) throw new Error('Defina SEED_SENHA no ambiente ou no .env da API para dar senha às pessoas do seed.');
  const total = await prisma.$transaction(async (tx) =>
    new TransacaoEmCurso(tx).rodar(async () => {
      await prisma.$executeRawUnsafe(`SET LOCAL sincronizacao.replicando = 'on'`);
      const s = montarServicos(prisma);
      const pessoas = await prisma.usuarios.findMany({ where: { email: { endsWith: `@${DOMINIO_DO_SEED}` }, deleted_at: null }, select: { id: true, email: true } });
      for (const p of pessoas) {
        await s.usuarios.resetPassword(p.id.trim(), await validar(ResetPasswordDto, { novaSenha: senha, confirmarSenha: senha }, `senha de ${p.email}`));
      }
      return pessoas.length;
    }),
  );
  log(`Senha do SEED_SENHA aplicada a ${total} pessoas do seed (trocam no primeiro acesso).`);
}

/** O que sobrou no disco sem conseguir apagar: o caminho de cada um, para apagar à mão */
function relatarPresos(presos: string[]): void {
  if (presos.length > 0) log(`  ${presos.length} arquivos não saíram de uploads/ (presos por outro programa): ${presos.join(', ')}`);
}

async function main(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));
  lerDoEnv(['DATABASE_URL', 'SEED_SENHA', 'PORT']);
  const banco = bancoDoAmbiente();
  await exigirApiParada();
  if (opcoes.aplicar) exigirBackup(opcoes.backup, banco.nome);

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await exigirBancoConectado(prisma, banco.nome);
    if (opcoes.senhas) return await trocarSenhas(prisma);

    log(`Seed do dev em ${banco.nome} — ${opcoes.aplicar ? 'GRAVANDO' : 'prévia (desfeita no fim)'}`);
    const antes = await contar(prisma);
    const arquivosAntes = arquivosDeUpload();
    let depois: Record<string, number> = {};
    let avisos: string[] = [];
    const inicioReal = Date.now();
    // Ctrl+C: o Postgres desfaz a transação quando a conexão cai; as fotos o seed tira antes de sair
    process.once('SIGINT', () => {
      const { apagados, presos } = apagarOsNovos(arquivosAntes);
      log(`\nInterrompido: nada foi gravado (${apagados} arquivos de upload desfeitos).`);
      relatarPresos(presos);
      process.exit(130);
    });

    try {
      await prisma.$transaction(
        async (tx) => {
          const emCurso = new TransacaoEmCurso(tx);
          await emCurso.rodar(async () => {
            // Nada do que o seed apaga ou cria vira evento para o NexOn
            await prisma.$executeRawUnsafe(`SET LOCAL sincronizacao.replicando = 'on'`);
            // O último evento de antes: o apagar tira os pendentes, e a conta antes/depois esconderia os novos
            const [{ ultimo: ultimoDoOutbox }] = await prisma.$queryRawUnsafe<{ ultimo: bigint }[]>(
              `SELECT coalesce(max(id), 0) AS ultimo FROM sincronizacao_outbox`,
            );

            const relogio = new Relogio(prisma);
            await relogio.preparar();
            log('Apagando os dados operacionais do dev');
            await apagarDadosDoDev(prisma, log);

            const agora = new Date();
            const c: Cenario = {
              prisma,
              s: montarServicos(prisma),
              relogio,
              sorteio: new Sorteio(SEMENTE),
              log,
              agora,
              inicio: as(somarDias(agora, -365), '00:00'),
              pessoas: new Map(),
              plantas: new Map(),
              equipamentos: new Map(),
              categorias: new Map(),
              modelos: new Map(),
              recursos: new Map(),
              maquinarios: new Map(),
              instrucoes: new Map(),
              templates: new Map(),
              veiculos: new Map(),
            };

            log('Cadastros');
            await corrigirCatalogo(c);
            await criarPessoas(c, process.env.SEED_SENHA || null);
            await criarPlantas(c);
            await criarAgenda(c);
            await criarFrota(c);
            await criarRecursos(c);
            await criarInstrucoes(c);
            await criarEquipamentos(c);
            await criarPlanos(c);

            log('Um ano de manutenção');
            await contarOAno(c);
            // A fila de propagação dos templates fica vazia (o cron dela não acha nada)
            await c.s.propagacao.processarFila();
            const codigos = await regravarCodigos(c);
            log(`  códigos de verificação regravados com as datas da história: ${codigos.regravados}`);

            avisos = await conferirCenario(c, { ultimoDoOutbox: BigInt(ultimoDoOutbox), anexosSemSoma: codigos.anexosSemSoma });
            depois = await contar(prisma);
          });
          // Os efeitos de fora do banco (boas-vindas, MQTT, disparo da propagação) não acontecem
          if (!opcoes.aplicar) throw new Desfazer();
        },
        { timeout: TEMPO_DA_TRANSACAO, maxWait: 10_000 },
      );
    } catch (erro) {
      const { apagados, presos } = apagarOsNovos(arquivosAntes);
      if (!(erro instanceof Desfazer)) {
        log(`\nFALHOU: nada foi gravado (${apagados} arquivos de upload desfeitos).`);
        relatarPresos(presos);
        throw erro;
      }
      log(`\nPrévia desfeita: nada foi gravado (${apagados} arquivos de upload desfeitos).`);
      relatarPresos(presos);
    }

    if (opcoes.aplicar) {
      // Gravado: as fotos do seed anterior, cujas linhas o apagar tirou, saem do disco
      const nomes = await Promise.all([
        prisma.anexos_os.findMany({ select: { nome: true } }),
        prisma.anexos_anomalias.findMany({ select: { nome: true } }),
        prisma.anexos_instrucao.findMany({ select: { nome: true } }),
      ]);
      const { apagados, presos } = apagarFotosOrfasDoSeed(new Set(nomes.flat().map((a) => a.nome.trim())));
      log(`\nFotos de seeds anteriores sem anexo no banco, apagadas: ${apagados}`);
      relatarPresos(presos);
    }

    log(`\n${'tabela'.padEnd(34)} ${'antes'.padStart(8)} ${'depois'.padStart(8)}`);
    for (const tabela of TABELAS_CONTADAS) log(`${tabela.padEnd(34)} ${String(antes[tabela]).padStart(8)} ${String(depois[tabela] ?? '-').padStart(8)}`);
    if (avisos.length > 0) log(`\nAvisos:\n${avisos.map((a) => `  - ${a}`).join('\n')}`);
    log(`\n${opcoes.aplicar ? 'Gravado' : 'Prévia'} em ${Math.round((Date.now() - inicioReal) / 1000)} s.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  // O passo da linha do tempo põe o rótulo e a data na mensagem e relança o erro original (stack e tipo inteiros)
  console.error(erro instanceof Error ? (process.env.STACK ? erro.stack : erro.message) : erro);
  process.exit(1);
});

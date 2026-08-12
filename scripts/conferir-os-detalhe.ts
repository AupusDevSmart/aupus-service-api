/**
 * Confere o que o detalhe da OS devolve para o card de origem — SOMENTE DEV.
 *
 * Chama o serviço real, então responde de vez se o problema está no backend ou
 * no bundle do front.
 *
 * Rodar: npx ts-node -r tsconfig-paths/register scripts/conferir-os-detalhe.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@aupus/api-shared';
import { ExecucaoOSService } from '../src/modules/execucao-os/execucao-os.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const execucao = app.get(ExecucaoOSService);

  const os = await prisma.ordens_servico.findFirst({
    where: { origem: 'TAREFA', deletado_em: null },
    orderBy: { criado_em: 'desc' },
    select: { id: true, numero_os: true },
  });

  if (!os) {
    console.log('nenhuma OS de origem TAREFA em DEV');
    await app.close();
    return;
  }

  const detalhe: any = await execucao.buscarPorId(os.id);
  const tarefas = detalhe.tarefas_os ?? [];

  console.log(`${os.numero_os} — tarefas_os: ${tarefas.length}`);
  for (const t of tarefas) {
    console.log('  ' + JSON.stringify({
      nome_snapshot: t.nome_snapshot,
      instrucao_nome: t.instrucao_nome,
      instrucao_id: t.instrucao_id,
      plano_nome: t.plano_nome,
      status: t.status,
    }));
  }

  await app.close();
}

main().catch((e) => {
  console.error('FALHOU:', e?.message ?? e);
  process.exit(1);
});

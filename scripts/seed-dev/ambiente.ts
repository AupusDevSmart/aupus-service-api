import * as fs from 'node:fs';
import * as net from 'node:net';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AtivosFuncionaisService,
  CategoriasEquipamentosService,
  EquipamentosService,
  MailService,
  PermissionScopeService,
  PermissionsService,
  PlantaOperadoresService,
  PlantasService,
  PrismaService,
  RolesService,
  TiposEquipamentosService,
  UnidadesService,
  UsuariosService,
} from '@/core';
import { exceptionFactoryEmPortugues } from '@/common/pipes/mensagens-validacao';
import { AnomaliasService } from '@/modules/anomalias/anomalias.service';
import { AnexosAnomaliasService } from '@/modules/anomalias/anexos-anomalias.service';
import { ComentariosService } from '@/modules/comentarios/comentarios.service';
import { ConfiguracoesDiasUteisService } from '@/modules/agenda/configuracoes-dias-uteis.service';
import { FeriadosService } from '@/modules/agenda/feriados.service';
import { AnexosOSService } from '@/modules/execucao-os/anexos-os.service';
import { ExecucaoOSService } from '@/modules/execucao-os/execucao-os.service';
import { AnexosInstrucoesService } from '@/modules/instrucoes/anexos-instrucoes.service';
import { InstrucoesService } from '@/modules/instrucoes/instrucoes.service';
import { MaquinariosService } from '@/modules/maquinarios/maquinarios.service';
import { ProcessadorDeNotificacoes } from '@/modules/notificacoes/processador-de-notificacoes';
import { NotificacoesService } from '@/modules/notificacoes/notificacoes.service';
import { LimpezaDeNotificacoes } from '@/modules/notificacoes/limpeza-de-notificacoes';
import { PlanosManutencaoService } from '@/modules/planos-manutencao/planos-manutencao.service';
import { PropagacaoPlanosService } from '@/modules/planos-manutencao/propagacao-planos.service';
import { ProgramacaoOSService } from '@/modules/programacao-os/programacao-os.service';
import { RecursosService } from '@/modules/recursos/recursos.service';
import { ReservasService } from '@/modules/reservas/reservas.service';
import { PropostaService } from '@/modules/solicitacoes-servico/proposta.service';
import { SolicitacoesServicoService } from '@/modules/solicitacoes-servico/solicitacoes-servico.service';
import { TarefasSchedulerService } from '@/modules/tarefas/tarefas-scheduler.service';
import { TarefasService } from '@/modules/tarefas/tarefas.service';
import { DocumentacaoVeiculosService } from '@/modules/veiculos/documentacao-veiculos.service';
import { VeiculosService } from '@/modules/veiculos/veiculos.service';

/** Os únicos bancos em que o seed roda: o de desenvolvimento e o dos testes. */
export const BANCOS_PERMITIDOS = ['aupus_local', 'aupus_test'];
/** O `hostname` de uma URL que não é http devolve o IPv6 entre colchetes */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
/** A 3000 é a do dev; a do PORT, se o .env mudar (o main.ts lê PORT) */
const PORTA_DO_DEV = 3000;
/** O backup que o --aplicar exige tem de ser recente: o de ontem não guarda o que se fez hoje. */
const IDADE_MAXIMA_DO_BACKUP_MS = 12 * 60 * 60 * 1000;

export interface Opcoes {
  aplicar: boolean;
  backup: string | null;
  senhas: boolean;
}

export function lerOpcoes(argv: string[]): Opcoes {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
  return { aplicar: argv.includes('--aplicar'), backup: valor('backup'), senhas: argv.includes('--senhas') };
}

/** O banco do DATABASE_URL, conferido antes de abrir qualquer conexão. */
export function bancoDoAmbiente(): { nome: string; host: string } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definido (o seed lê o .env da API).');
  const { hostname, pathname, searchParams } = new URL(url);
  const nome = decodeURIComponent(pathname.replace(/^\//, ''));
  // O Prisma usa o ?host= da query no lugar do host da URL: localhost na frente, outro servidor de fato
  if (!HOSTS_LOCAIS.has(hostname) || searchParams.has('host') || searchParams.has('hostaddr')) {
    throw new Error(`O seed só roda contra o Postgres local; o DATABASE_URL aponta para outro servidor.`);
  }
  if (!BANCOS_PERMITIDOS.includes(nome)) {
    throw new Error(`O seed só roda em ${BANCOS_PERMITIDOS.join(' ou ')}; o DATABASE_URL aponta para "${nome}".`);
  }
  return { nome, host: hostname };
}

/** Depois de conectar, o banco de verdade: pega qualquer diferença entre o que a URL diz e o que o Prisma abriu */
export async function exigirBancoConectado(prisma: PrismaService, esperado: string): Promise<void> {
  const [{ banco }] = await prisma.$queryRawUnsafe<{ banco: string }[]>(`SELECT current_database() AS banco`);
  if (banco !== esperado || !BANCOS_PERMITIDOS.includes(banco)) {
    throw new Error(`O seed abriu o banco "${banco}", não o "${esperado}" do DATABASE_URL: parou antes de mexer.`);
  }
}

/** A API de dev parada: o cron, a fila de notificações e a entrega ao NexOn não podem rodar junto. */
export async function exigirApiParada(): Promise<void> {
  const portas = [...new Set([PORTA_DO_DEV, Number(process.env.PORT) || PORTA_DO_DEV])];
  for (const porta of portas) {
    if (await algoOuvindo(porta)) throw new Error(`Há algo ouvindo na porta ${porta}: pare a API de dev antes do seed.`);
  }
}

async function algoOuvindo(porta: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: porta });
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/**
 * Apagar o dev pede o backup de agora, e o seed confere que é um pg_dump
 * (formato custom, assinatura PGDMP) deste banco e de hoje. O dump é gravado
 * dentro do container: `docker cp` para o host antes de passar o caminho.
 */
export function exigirBackup(caminho: string | null, banco: string): void {
  const comando = `docker exec aupus-postgres-local pg_dump -U postgres -Fc -d ${banco} -f /tmp/antes-do-seed.dump && docker cp aupus-postgres-local:/tmp/antes-do-seed.dump <pasta>`;
  if (!caminho) throw new Error(`--aplicar apaga os dados do dev: faça o backup e passe --backup=<arquivo>. Ex.: ${comando}`);
  if (!fs.existsSync(caminho)) throw new Error(`Backup não encontrado: ${caminho}`);
  const arquivo = fs.statSync(caminho);
  if (arquivo.size < 1024) throw new Error(`O backup ${caminho} está vazio.`);
  if (Date.now() - arquivo.mtimeMs > IDADE_MAXIMA_DO_BACKUP_MS) throw new Error(`O backup ${caminho} tem mais de 12 horas: faça outro.`);
  const cabecalho = Buffer.alloc(4096);
  const fd = fs.openSync(caminho, 'r');
  try {
    fs.readSync(fd, cabecalho, 0, cabecalho.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (cabecalho.subarray(0, 5).toString('latin1') !== 'PGDMP') {
    throw new Error(`O backup ${caminho} não é um pg_dump no formato custom (-Fc).`);
  }
  // O cabeçalho do formato custom leva o nome do banco de onde saiu
  if (!cabecalho.includes(Buffer.from(banco))) throw new Error(`O backup ${caminho} não é do banco ${banco}.`);
}

/**
 * O e-mail não sai do seed: as boas-vindas passam por `depoisDeGravar`, que o
 * seed descarta, e um envio direto que escapasse cai aqui e derruba tudo.
 */
class CorreioRecusado {
  private recusar(): never {
    throw new Error('O seed não envia e-mail.');
  }
  async sendWelcomeEmail(): Promise<void> {
    this.recusar();
  }
  async sendPasswordResetEmail(): Promise<void> {
    this.recusar();
  }
  async enviarNotificacao(): Promise<void> {
    this.recusar();
  }
}

/**
 * Os services de verdade, montados como nos specs de banco: sem o módulo da
 * aplicação, então sem cron, sem MQTT, sem e-mail e sem entrega ao NexOn.
 */
export function montarServicos(prisma: PrismaService) {
  const escopo = new PermissionScopeService(prisma);
  const propagacao = new PropagacaoPlanosService(prisma);
  const correio = new CorreioRecusado() as unknown as MailService;
  const programacoes = new ProgramacaoOSService(prisma, escopo);
  const propostas = new PropostaService(prisma);
  const solicitacoes = new SolicitacoesServicoService(prisma, escopo, propostas);
  const veiculos = new VeiculosService(prisma, escopo);
  return {
    escopo,
    propagacao,
    usuarios: new UsuariosService(prisma, new RolesService(prisma), new PermissionsService(prisma), correio),
    plantas: new PlantasService(prisma, escopo),
    unidades: new UnidadesService(prisma, escopo),
    operadores: new PlantaOperadoresService(prisma),
    categorias: new CategoriasEquipamentosService(prisma),
    modelos: new TiposEquipamentosService(prisma),
    equipamentos: new EquipamentosService(prisma, escopo),
    posicoes: new AtivosFuncionaisService(prisma),
    recursos: new RecursosService(prisma),
    maquinarios: new MaquinariosService(prisma),
    instrucoes: new InstrucoesService(prisma, propagacao, escopo),
    anexosDaInstrucao: new AnexosInstrucoesService(prisma),
    planos: new PlanosManutencaoService(prisma, escopo, propagacao),
    tarefas: new TarefasService(prisma, escopo, propagacao),
    programacoes,
    agendador: new TarefasSchedulerService(prisma, programacoes),
    execucoes: new ExecucaoOSService(prisma, escopo),
    anexosDaOS: new AnexosOSService(prisma, escopo),
    anomalias: new AnomaliasService(prisma, escopo),
    anexosDaAnomalia: new AnexosAnomaliasService(prisma),
    propostas,
    solicitacoes,
    comentarios: new ComentariosService(prisma, escopo),
    veiculos,
    documentos: new DocumentacaoVeiculosService(prisma),
    reservas: new ReservasService(prisma, veiculos, escopo),
    feriados: new FeriadosService(prisma),
    diasUteis: new ConfiguracoesDiasUteisService(prisma),
    notificacoes: new ProcessadorDeNotificacoes(prisma),
    sininho: new NotificacoesService(prisma),
    limpezaDeNotificacoes: new LimpezaDeNotificacoes(prisma),
  };
}

export type Servicos = ReturnType<typeof montarServicos>;

/** O mesmo pipe global da API (configurar-app.ts): o dado do seed obedece às regras do formulário. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: exceptionFactoryEmPortugues,
});

/** O corpo passa pelo DTO como passaria pela rota; o erro diz qual campo e por quê. */
export async function validar<T extends object>(classe: new () => T, corpo: object, onde: string): Promise<T> {
  try {
    return (await pipe.transform(corpo, { type: 'body', metatype: classe })) as T;
  } catch (erro) {
    if (erro instanceof BadRequestException) {
      throw new Error(`${onde}: o DTO ${classe.name} recusou o dado: ${JSON.stringify(erro.getResponse())}`);
    }
    throw erro;
  }
}

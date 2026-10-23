import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { CreateConcessionariaDto } from '../../core/modules/concessionarias/dto/create-concessionaria.dto';
import { UpdateConcessionariaDto } from '../../core/modules/concessionarias/dto/update-concessionaria.dto';
import { CreateEquipamentoDto } from '../../core/modules/equipamentos/dto/create-equipamento.dto';
import { UpdateEquipamentoDto } from '../../core/modules/equipamentos/dto/update-equipamento.dto';
import { CreateFeriadoDto } from '../../modules/agenda/dto/create-feriado.dto';
import { UpdateFeriadoDto } from '../../modules/agenda/dto/update-feriado.dto';
import { ProximosDiasUteisDto, VerificarDiaUtilDto } from '../../modules/agenda/dto/verificar-dia-util.dto';
import { CreateAnomaliaDto } from '../../modules/anomalias/dto/create-anomalia.dto';
import { UpdateAnomaliaDto } from '../../modules/anomalias/dto/update-anomalia.dto';
import { ChamadoNexonDto } from '../../modules/integracoes-nexon/dto/chamado-nexon.dto';
import { ExecutarOSDto, IniciarExecucaoDto } from '../../modules/execucao-os/dto/os-actions.dto';
import { OSFiltersDto } from '../../modules/execucao-os/dto/os-filters.dto';
import { CreateCalibracaoDto } from '../../modules/ferramentas/dto/create-calibracao.dto';
import { CreateFerramentaDto } from '../../modules/ferramentas/dto/create-ferramenta.dto';
import { CreateManutencaoDto } from '../../modules/ferramentas/dto/create-manutencao.dto';
import { UpdateFerramentaDto } from '../../modules/ferramentas/dto/update-ferramenta.dto';
import { UpdateManutencaoDto } from '../../modules/ferramentas/dto/update-manutencao.dto';
import { AjusteDeDataDto } from '../../modules/planos-manutencao/dto/herdar-plano.dto';
import { CreateProgramacaoDto } from '../../modules/programacao-os/dto/create-programacao.dto';
import { CreateReservaDto } from '../../modules/reservas/dto/create-reserva.dto';
import { QueryReservasDto } from '../../modules/reservas/dto/query-reservas.dto';
import { UpdateReservaDto } from '../../modules/reservas/dto/update-reserva.dto';
import { AlterarStatusVeiculoDto } from '../../modules/veiculos/dto/alterar-status-veiculo.dto';
import { CreateDocumentacaoVeiculoDto } from '../../modules/veiculos/dto/create-documentacao-veiculo.dto';
import { CreateVeiculoDto } from '../../modules/veiculos/dto/create-veiculo.dto';
import { UpdateDocumentacaoVeiculoDto } from '../../modules/veiculos/dto/update-documentacao-veiculo.dto';
import { UpdateVeiculoDto } from '../../modules/veiculos/dto/update-veiculo.dto';
import { VeiculosDisponiveisDto } from '../../modules/veiculos/dto/veiculos-disponiveis.dto';
import { AprovarProgramacaoDto, CreateProgramacaoTarefasDto } from '../../modules/programacao-os/dto/programacao-actions.dto';
import { ProgramacaoFiltersDto } from '../../modules/programacao-os/dto/programacao-filters.dto';
import { UpdateProgramacaoDto } from '../../modules/programacao-os/dto/update-programacao.dto';
import { CreateSolicitacaoDto } from '../../modules/solicitacoes-servico/dto/create-solicitacao.dto';
import { SolicitacaoFiltersDto } from '../../modules/solicitacoes-servico/dto/solicitacao-filters.dto';
import { UpdateSolicitacaoDto } from '../../modules/solicitacoes-servico/dto/update-solicitacao.dto';

/**
 * Toda data que a API recebe, campo a campo (SN-74).
 *
 * O `@IsDateString()` solto aceitava "2027-01-15" num DateTime (o Prisma
 * recusava: 500), "2026-10-16T10:00" (lido no fuso do servidor), "2026-W42-5"
 * e "2026-10-16T10Z" (Invalid Date: 500). Cada campo tem uma forma:
 *
 * - `dia`: coluna `@db.Date`; "AAAA-MM-DD" vira a meia-noite UTC; vazio apaga;
 * - `dia-obrigatoria`: idem, NOT NULL — vazio e null são 400, também no update;
 * - `dia-texto`: só "AAAA-MM-DD", como texto (o service junta com a hora de Brasília);
 * - `dia-texto-obrigatoria`: idem, obrigatório;
 * - `data` / `data-obrigatoria`: o dia num campo que o service recebe como `Date`;
 * - `instante`: data e hora com o fuso, como o `toISOString` da tela;
 * - `instante-obrigatorio`: idem, NOT NULL;
 * - `periodo`: começo/fim de filtro — "AAAA-MM-DD" (o dia em Brasília) ou instante;
 * - `hora`: "HH:mm" de Brasília, que o service junta ao dia.
 */
type Forma =
  | 'dia' | 'dia-obrigatoria' | 'dia-texto' | 'dia-texto-obrigatoria' | 'data' | 'data-obrigatoria'
  | 'instante' | 'instante-obrigatorio' | 'periodo' | 'hora';
type Dto = new () => object;

const CAMPOS: Array<[Dto, string, Forma, Record<string, unknown>?]> = [
  [CreateConcessionariaDto, 'data_inicio', 'dia-obrigatoria'],
  [CreateConcessionariaDto, 'data_validade', 'dia-obrigatoria'],
  [UpdateConcessionariaDto, 'data_inicio', 'dia-obrigatoria'],
  [UpdateConcessionariaDto, 'data_validade', 'dia-obrigatoria'],
  [CreateEquipamentoDto, 'data_imobilizacao', 'dia'],
  [CreateEquipamentoDto, 'data_instalacao', 'dia'],
  [CreateEquipamentoDto, 'garantia_ate', 'dia'],
  [UpdateEquipamentoDto, 'garantia_ate', 'dia'],
  [CreateAnomaliaDto, 'prazo', 'instante'],
  [UpdateAnomaliaDto, 'prazo', 'instante'],
  [ChamadoNexonDto, 'aberto_em', 'instante'],
  [IniciarExecucaoDto, 'data_hora_inicio_real', 'instante'],
  [ExecutarOSDto, 'data_hora_fim_real', 'instante'],
  [ExecutarOSDto, 'parada_inicio', 'instante'],
  [ExecutarOSDto, 'parada_fim', 'instante'],
  [OSFiltersDto, 'data_inicio', 'periodo'],
  [OSFiltersDto, 'data_fim', 'periodo'],
  [CreateCalibracaoDto, 'data_calibracao', 'dia-obrigatoria'],
  [CreateCalibracaoDto, 'data_vencimento', 'dia-obrigatoria'],
  [CreateFerramentaDto, 'data_aquisicao', 'dia-obrigatoria'],
  [UpdateFerramentaDto, 'data_aquisicao', 'dia-obrigatoria'],
  [CreateFerramentaDto, 'proxima_data_calibracao', 'dia', { necessita_calibracao: false }],
  [CreateManutencaoDto, 'data_inicio', 'instante-obrigatorio'],
  [UpdateManutencaoDto, 'data_inicio', 'instante-obrigatorio'],
  [CreateManutencaoDto, 'data_fim', 'instante'],
  [UpdateManutencaoDto, 'data_fim', 'instante'],
  [AjusteDeDataDto, 'data_ultima_execucao', 'instante'],
  [CreateProgramacaoDto, 'data_previsao_inicio', 'instante'],
  [CreateProgramacaoDto, 'data_previsao_fim', 'instante'],
  [CreateProgramacaoDto, 'data_hora_programada', 'instante'],
  [UpdateProgramacaoDto, 'data_hora_programada', 'instante'],
  [CreateProgramacaoDto, 'reserva_data_inicio', 'dia'],
  [CreateProgramacaoDto, 'reserva_data_fim', 'dia'],
  [UpdateProgramacaoDto, 'reserva_data_fim', 'dia'],
  [AprovarProgramacaoDto, 'data_programada_sugerida', 'dia-texto'],
  [CreateProgramacaoTarefasDto, 'data_hora_programada', 'instante'],
  [ProgramacaoFiltersDto, 'data_inicio', 'periodo'],
  [ProgramacaoFiltersDto, 'data_fim', 'periodo'],
  [CreateSolicitacaoDto, 'data_necessidade', 'instante'],
  [UpdateSolicitacaoDto, 'data_necessidade', 'instante'],
  [CreateSolicitacaoDto, 'data_prevista_inicio', 'instante'],
  [CreateSolicitacaoDto, 'data_prevista_fim', 'instante'],
  [SolicitacaoFiltersDto, 'data_inicio', 'periodo'],
  [SolicitacaoFiltersDto, 'data_fim', 'periodo'],
  // Os que eram @Type(() => Date) + @IsDate (o service recebe Date)
  [CreateFeriadoDto, 'data', 'data-obrigatoria'],
  [UpdateFeriadoDto, 'data', 'data-obrigatoria'],
  [VerificarDiaUtilDto, 'data', 'data-obrigatoria'],
  [ProximosDiasUteisDto, 'dataInicio', 'data'],
  [CreateReservaDto, 'dataInicio', 'data-obrigatoria'],
  [CreateReservaDto, 'dataFim', 'data-obrigatoria'],
  [UpdateReservaDto, 'dataFim', 'data-obrigatoria'],
  [AlterarStatusVeiculoDto, 'dataRetornoPrevista', 'data'],
  [CreateDocumentacaoVeiculoDto, 'dataVencimento', 'data-obrigatoria'],
  [UpdateDocumentacaoVeiculoDto, 'dataVencimento', 'data-obrigatoria'],
  [CreateVeiculoDto, 'dataAquisicao', 'data'],
  [CreateVeiculoDto, 'proximaRevisao', 'data'],
  [CreateVeiculoDto, 'ultimaRevisao', 'data'],
  [UpdateVeiculoDto, 'vencimentoSeguro', 'data'],
  // Os que eram só @IsString
  [QueryReservasDto, 'dataInicio', 'dia'],
  [QueryReservasDto, 'dataFim', 'dia'],
  [VeiculosDisponiveisDto, 'dataInicio', 'dia-texto-obrigatoria'],
  [VeiculosDisponiveisDto, 'dataFim', 'dia-texto-obrigatoria'],
  // A hora que se junta ao dia: "99:99" montava Invalid Date (500)
  [AprovarProgramacaoDto, 'hora_programada_sugerida', 'hora'],
  [CreateProgramacaoDto, 'reserva_hora_inicio', 'hora'],
  [UpdateProgramacaoDto, 'reserva_hora_fim', 'hora'],
];

/** O valor que o service recebe e se o campo teve erro (o resto do DTO não importa aqui). */
async function ler(dto: Dto, campo: string, valor: unknown, extras: Record<string, unknown> = {}) {
  const instancia = plainToInstance(dto, { ...extras, [campo]: valor }, { enableImplicitConversion: true }) as Record<string, unknown>;
  const erros = await validate(instancia);
  return { valor: instancia[campo], recusado: erros.some((e) => e.property === campo) };
}

const MEIA_NOITE = new Date('2027-01-15T00:00:00.000Z');
const ACEITA: Record<Forma, Array<[unknown, unknown]>> = {
  dia: [['2027-01-15', '2027-01-15T00:00:00.000Z'], [' 2027-01-15 ', '2027-01-15T00:00:00.000Z'], ['2027-01-15T00:00:00.000Z', '2027-01-15T00:00:00.000Z'], ['', null], [null, null]],
  'dia-obrigatoria': [['2027-01-15', '2027-01-15T00:00:00.000Z'], ['2027-01-15T00:00:00.000Z', '2027-01-15T00:00:00.000Z']],
  'dia-texto': [['2027-01-15', '2027-01-15'], ['', null]],
  'dia-texto-obrigatoria': [['2027-01-15', '2027-01-15'], [' 2027-01-15 ', '2027-01-15']],
  data: [['2027-01-15', MEIA_NOITE], ['2027-01-15T00:00:00.000Z', MEIA_NOITE], ['', null], [null, null]],
  'data-obrigatoria': [['2027-01-15', MEIA_NOITE], ['2027-01-15T00:00:00.000Z', MEIA_NOITE]],
  hora: [['08:00', '08:00'], ['23:59', '23:59'], ['', null], [null, null]],
  instante: [['2026-10-16T13:05:00Z', '2026-10-16T13:05:00Z'], ['2026-10-16T10:05:00-03:00', '2026-10-16T10:05:00-03:00'], ['2026-10-16T13:05:00.123Z', '2026-10-16T13:05:00.123Z'], [null, null]],
  'instante-obrigatorio': [['2026-10-16T13:05:00.000Z', '2026-10-16T13:05:00.000Z']],
  periodo: [['2027-01-15', '2027-01-15'], ['2026-10-16T13:05:00.000Z', '2026-10-16T13:05:00.000Z']],
};

// O ano 9999 no fim de um período vira 10000 em UTC, que o Prisma recusa (500)
const SEMPRE_RECUSADOS = ['2026-02-30', '2026-W42-5', '15/01/2027', '2026-10-16T10Z', '2026-10-16T10:00', 20270115, '9999-12-31', '0001-01-01', '9999-12-31T23:59:59-03:00'];
// Num campo de dia, outro instante grava outro dia: 22:00 em Brasília já é o dia seguinte em UTC
const OUTRA_HORA = '2027-01-15T22:00:00-03:00';
const RECUSA: Record<Forma, unknown[]> = {
  dia: [...SEMPRE_RECUSADOS, OUTRA_HORA],
  'dia-obrigatoria': [...SEMPRE_RECUSADOS, OUTRA_HORA, '', null],
  'dia-texto': [...SEMPRE_RECUSADOS, '2027-01-15T00:00:00.000Z'],
  'dia-texto-obrigatoria': [...SEMPRE_RECUSADOS, '2027-01-15T00:00:00.000Z', '', null],
  data: [...SEMPRE_RECUSADOS, OUTRA_HORA],
  'data-obrigatoria': [...SEMPRE_RECUSADOS, OUTRA_HORA, '', null],
  hora: ['99:99', '24:00', '8h', '8:00', '08:00:00', 800],
  instante: [...SEMPRE_RECUSADOS, '2027-01-15', '2026-10-16T10:00:00', '2026-W42-5T10:00:00Z', '2026-02-30T10:00:00Z', ''],
  'instante-obrigatorio': [...SEMPRE_RECUSADOS, '2027-01-15', '', null],
  periodo: [...SEMPRE_RECUSADOS, '2026-10-16T10:00:00'],
};

const linhas = CAMPOS.map(([dto, campo, forma, extras]) => [`${dto.name}.${campo}`, forma, dto, campo, extras] as const);

describe('datas no corpo e na query (SN-74)', () => {
  it.each(linhas)('%s (%s): aceita o que deve, e entrega o que o service espera', async (_n, forma, dto, campo, extras) => {
    for (const [entrada, saida] of ACEITA[forma]) {
      const lido = await ler(dto, campo, entrada, extras);
      expect({ entrada, ...lido }).toEqual({ entrada, valor: saida, recusado: false });
    }
  });

  it.each(linhas)('%s (%s): o resto é 400, não 500', async (_n, forma, dto, campo, extras) => {
    for (const entrada of RECUSA[forma]) {
      expect({ entrada, recusado: (await ler(dto, campo, entrada, extras)).recusado }).toEqual({ entrada, recusado: true });
    }
  });

  it('ferramenta que precisa de calibração precisa da próxima data', async () => {
    expect((await ler(CreateFerramentaDto, 'proxima_data_calibracao', '', { necessita_calibracao: true })).recusado).toBe(true);
    expect((await ler(CreateFerramentaDto, 'proxima_data_calibracao', null, { necessita_calibracao: true })).recusado).toBe(true);
    expect((await ler(CreateFerramentaDto, 'proxima_data_calibracao', '2027-01-15', { necessita_calibracao: true })).recusado).toBe(false);
  });

  it('ausente continua ausente, também no obrigatório do update', async () => {
    const instancia = plainToInstance(UpdateConcessionariaDto, {}, { enableImplicitConversion: true });
    expect(await validate(instancia)).toEqual([]);
    expect(instancia).not.toHaveProperty('data_inicio');
  });

  // O próximo campo de data entra por um dos decorators acima (e nesta tabela)
  it('nenhum código volta ao @IsDateString, ao @IsISO8601 solto nem ao @Type(() => Date)', () => {
    const raiz = join(__dirname, '..', '..');
    const arquivos = (pasta: string): string[] =>
      readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
        const caminho = join(pasta, item.name);
        if (item.isDirectory()) return arquivos(caminho);
        return item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts') ? [caminho] : [];
      });
    const decorators = join(raiz, 'common', 'decorators');
    const soltos = arquivos(raiz)
      .filter((arquivo) => !arquivo.startsWith(decorators))
      .filter((arquivo) => {
        const codigo = readFileSync(arquivo, 'utf-8');
        // Pelo import: pega também o uso dentro de um applyDecorators
        const doValidator = codigo.match(/import\s*\{([^}]*)\}\s*from\s*'class-validator'/g)?.join(' ') ?? '';
        return /\b(IsDateString|IsISO8601)\b/.test(doValidator) || /Type\(\s*\(\)\s*=>\s*Date\s*\)/.test(codigo);
      })
      .map((arquivo) => relative(raiz, arquivo));

    expect(soltos).toEqual([]);
  });
});

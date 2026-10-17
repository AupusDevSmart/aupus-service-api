import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { EquipamentoQueryDto } from '../../core/modules/equipamentos/dto/equipamento-query.dto';
import { UsuarioQueryDto } from '../../core/modules/usuarios/dto/usuario-query.dto';
import { QueryConfiguracoesDto } from '../../modules/agenda/dto/query-configuracoes.dto';
import { QueryFeriadosDto } from '../../modules/agenda/dto/query-feriados.dto';
import { CreateFerramentaDto } from '../../modules/ferramentas/dto/create-ferramenta.dto';
import { QueryFerramentasDto } from '../../modules/ferramentas/dto/query-ferramentas.dto';
import { QueryInstrucoesDto } from '../../modules/instrucoes/dto/query-instrucoes.dto';
import { QueryPlanosPorPlantaDto } from '../../modules/planos-manutencao/dto/query-planos-por-planta.dto';
import { QueryPlanosDto } from '../../modules/planos-manutencao/dto/query-planos.dto';
import { QueryRecursosDto } from '../../modules/recursos/dto/recurso.dto';
import { QueryTarefasDto } from '../../modules/tarefas/dto/query-tarefas.dto';
import { QueryVeiculosDto } from '../../modules/veiculos/dto/query-veiculos.dto';
import { OSFiltersDto } from '../../modules/execucao-os/dto/os-filters.dto';
import { ListarNotificacoesDto } from '../../modules/notificacoes/notificacoes.dto';

/**
 * Booleano na query string, com o pipe do configurar-app (achado no SN-59).
 *
 * O `enableImplicitConversion` converte antes do @Transform: "false" vira
 * Boolean("false") = true, e os Transforms dos DTOs (`value === 'false'`)
 * nunca casavam. O filtro "Específica" dos feriados trazia as gerais; "Exclui
 * sábado" nos dias úteis trazia as que incluem. `BooleanoDoTexto` lê o valor
 * como chegou.
 */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const ler = (metatype: new () => object, dados: Record<string, string>) =>
  pipe.transform({ ...dados }, { type: 'query', metatype }) as Promise<Record<string, unknown>>;

const CAMPOS: Array<[new () => object, string]> = [
  [EquipamentoQueryDto, 'semDiagrama'],
  [EquipamentoQueryDto, 'mqtt_habilitado'],
  [EquipamentoQueryDto, 'semPlano'],
  [EquipamentoQueryDto, 'ocultarVirtuais'],
  [UsuarioQueryDto, 'includeInactive'],
  [QueryConfiguracoesDto, 'geral'],
  [QueryConfiguracoesDto, 'sabado'],
  [QueryConfiguracoesDto, 'domingo'],
  [QueryFeriadosDto, 'geral'],
  [QueryFeriadosDto, 'recorrente'],
  [QueryFerramentasDto, 'necessita_calibracao'],
  [QueryFerramentasDto, 'calibracao_vencida'],
  [QueryInstrucoesDto, 'ativo'],
  [QueryPlanosPorPlantaDto, 'incluir_tarefas'],
  [QueryPlanosDto, 'vinculados'],
  [QueryRecursosDto, 'apenas_ativos'],
  [QueryTarefasDto, 'ativo'],
  [QueryTarefasDto, 'status_atrasada'],
  [QueryVeiculosDto, 'ativo'],
  [QueryVeiculosDto, 'apenasDisponiveis'],
  [OSFiltersDto, 'atrasadas'],
  [ListarNotificacoesDto, 'somenteNaoLidas'],
];

describe('booleano na query string', () => {
  it.each(CAMPOS.map(([dto, campo]) => [dto.name, campo, dto] as const))('%s.%s: "true" e "false" são o que dizem', async (_n, campo, dto) => {
    expect((await ler(dto, { [campo]: 'true' }))[campo]).toBe(true);
    expect((await ler(dto, { [campo]: 'false' }))[campo]).toBe(false);
  });

  it.each(CAMPOS.map(([dto, campo]) => [dto.name, campo, dto] as const))('%s.%s: texto que não é booleano é 400', async (_n, campo, dto) => {
    await expect(ler(dto, { [campo]: 'talvez' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vazio não filtra; ausente mantém o padrão do DTO', async () => {
    expect((await ler(QueryFeriadosDto, { geral: '' })).geral).toBeUndefined();
    expect((await ler(QueryVeiculosDto, {})).ativo).toBe(true);
    expect((await ler(UsuarioQueryDto, {})).includeInactive).toBe(false);
  });

  it('no corpo (JSON), o booleano de verdade passa como é', () => {
    const corpo = plainToInstance(CreateFerramentaDto, { necessita_calibracao: false }, { enableImplicitConversion: true });
    expect(corpo.necessita_calibracao).toBe(false);
  });
});

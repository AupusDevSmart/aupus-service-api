import { ClassConstructor, plainToInstance } from 'class-transformer';
import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * DTO parcial não inventa valor (SN-12).
 *
 * O PartialType (do mapped-types e do swagger) copia os inicializadores do
 * Create no construtor: com `status = ATIVA` no Create, um PUT sem `status`
 * reativava a instrução, e `sub_instrucoes = []` apagava todas. Num update,
 * "não enviado" tem que continuar "não enviado". O padrão de criação mora
 * no service ou no banco, nunca no inicializador do Create.
 *
 * Percorre todo *.dto.ts: o próximo Update criado entra sozinho.
 */
function arquivosDeDto(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = join(pasta, item.name);
    if (item.isDirectory()) return arquivosDeDto(caminho);
    return item.name.endsWith('.dto.ts') ? [caminho] : [];
  });
}

function ehClasse(valor: unknown): valor is ClassConstructor<object> {
  return typeof valor === 'function' && /^class\s/.test(Function.prototype.toString.call(valor));
}

/** Os dois PartialType nomeiam a classe gerada com o prefixo "Partial". */
function ehParcial(classe: ClassConstructor<object>): boolean {
  for (let atual: unknown = classe; typeof atual === 'function'; atual = Object.getPrototypeOf(atual)) {
    if ((atual as { name: string }).name.startsWith('Partial')) return true;
  }
  return false;
}

const parciais = arquivosDeDto(join(__dirname, '..', '..'))
  .flatMap((arquivo) => Object.entries(jest.requireActual<Record<string, unknown>>(arquivo)))
  .filter((entrada): entrada is [string, ClassConstructor<object>] => ehClasse(entrada[1]) && ehParcial(entrada[1]));

describe('DTO parcial sem padrão herdado', () => {
  it('encontra os DTOs parciais (senão o teste abaixo não testaria nada)', () => {
    expect(parciais.length).toBeGreaterThan(15);
  });

  it.each(parciais)('%s: corpo vazio continua vazio', (_nome, classe) => {
    const dto = plainToInstance(classe, {}, { enableImplicitConversion: true });
    const inventados = Object.entries(dto).filter(([, valor]) => valor !== undefined);

    expect(inventados).toEqual([]);
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IniciarExecucaoDto, ExecutarOSDto } from './dto/os-actions.dto';
import { CreateVeiculoDto } from '../veiculos/dto/create-veiculo.dto';

/**
 * O KM da viatura (inicial e final da reserva, quilometragem do veículo). As
 * colunas são Int: o `km_final` era `IsNumber`, e 1260,5 passava o DTO e o
 * Prisma recusava com 500; sem teto, um número acima do Int também dava 500.
 * Achado ao gravar os vídeos (22/out/2026), junto com o campo da tela, que era
 * type="number" e perdia o "45.230" num navegador em português.
 */
const regrasQueFalham = async <T extends object>(metatype: new () => T, dados: object, campo: string) => {
  const dto = plainToInstance(metatype, dados, { enableImplicitConversion: true });
  const erros = await validate(dto);
  return erros.filter((e) => e.property === campo).flatMap((e) => Object.keys(e.constraints ?? {}));
};

describe('KM da viatura nos DTOs', () => {
  it('km inicial: inteiro de 0 a 9.999.999', async () => {
    expect(await regrasQueFalham(IniciarExecucaoDto, { km_inicial: 45230 }, 'km_inicial')).toEqual([]);
    expect(await regrasQueFalham(IniciarExecucaoDto, { km_inicial: 9_999_999 }, 'km_inicial')).toEqual([]);
    expect(await regrasQueFalham(IniciarExecucaoDto, { km_inicial: 10_000_000 }, 'km_inicial')).toContain('max');
    expect(await regrasQueFalham(IniciarExecucaoDto, { km_inicial: 12.5 }, 'km_inicial')).toContain('isInt');
    expect(await regrasQueFalham(IniciarExecucaoDto, { km_inicial: -1 }, 'km_inicial')).toContain('min');
  });

  it('km final: inteiro como a coluna (era IsNumber: 1260,5 virava 500 no banco)', async () => {
    expect(await regrasQueFalham(ExecutarOSDto, { km_final: 1260 }, 'km_final')).toEqual([]);
    expect(await regrasQueFalham(ExecutarOSDto, { km_final: 1260.5 }, 'km_final')).toContain('isInt');
    expect(await regrasQueFalham(ExecutarOSDto, { km_final: 3_000_000_000 }, 'km_final')).toContain('max');
  });

  it('quilometragem do veículo: com teto (acima do Int dava 500)', async () => {
    expect(await regrasQueFalham(CreateVeiculoDto, { quilometragem: 120000 }, 'quilometragem')).toEqual([]);
    expect(await regrasQueFalham(CreateVeiculoDto, { quilometragem: 3_000_000_000 }, 'quilometragem')).toContain('max');
  });
});

import { BadRequestException, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { CreatePlantaDto } from './dto/create-planta.dto';
import { UpdatePlantaDto } from './dto/update-planta.dto';
import { CreateUnidadeDto } from '../unidades/dto/create-unidade.dto';
import { UpdateUnidadeDto } from '../unidades/dto/update-unidade.dto';
import { PlantasService } from './plantas.service';
import { NAO_PASSA_A_OUTRO_DONO, SO_EM_NOME_PROPRIO, problemaNoDono } from './dono-da-planta';

/**
 * Planta e instalação sem campos obrigatórios (05/nov/2026): "muitas vezes não
 * temos o CNPJ da planta ou o CEP". Ficam exigidos o nome da planta e, na
 * instalação, o nome e a planta; o que vier é conferido no formato, e o vazio
 * grava "sem valor" (null).
 */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const validar = <T>(dto: new () => T, corpo: unknown): Promise<T> =>
  pipe.transform(corpo, { type: 'body', metatype: dto } as ArgumentMetadata) as Promise<T>;

describe('planta sem campos obrigatórios', () => {
  it('só com o nome passa', async () => {
    await expect(validar(CreatePlantaDto, { nome: 'Fazenda Boa Vista' })).resolves.toMatchObject({ nome: 'Fazenda Boa Vista' });
  });

  it('o vazio vira null; o nome continua obrigatório', async () => {
    const dto = await validar(CreatePlantaDto, {
      nome: 'Fazenda',
      cnpj: '',
      proprietarioId: ' ',
      horarioFuncionamento: '',
      localizacao: '',
      endereco: { logradouro: '', bairro: '', cidade: '', uf: '', cep: '' },
    });
    expect(dto).toMatchObject({ cnpj: null, proprietarioId: null, horarioFuncionamento: null, localizacao: null });
    expect(dto.endereco).toMatchObject({ logradouro: null, cidade: null, uf: null, cep: null });
    await expect(validar(CreatePlantaDto, { cnpj: '12.345.678/0001-90' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('o que vier é conferido no formato', async () => {
    await expect(validar(CreatePlantaDto, { nome: 'Fazenda', cnpj: '123' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar(CreatePlantaDto, { nome: 'Fazenda', endereco: { cep: '74000000' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('na edição, o vazio apaga o campo (null) e o ausente não mexe', async () => {
    const dto = await validar(UpdatePlantaDto, { cnpj: '' });
    expect(dto.cnpj).toBeNull();
    expect('localizacao' in dto).toBe(false);
  });

  it('cria sem CNPJ nem dono: não consulta o CNPJ nem o dono, e grava null', async () => {
    const prisma = {
      usuarios: { findUnique: jest.fn() },
      plantas: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'p1', nome: 'Fazenda', proprietario: null }) },
    };
    const service = new PlantasService(prisma as never, {} as never);

    await service.create({ nome: 'Fazenda' } as CreatePlantaDto);

    expect(prisma.usuarios.findUnique).not.toHaveBeenCalled();
    expect(prisma.plantas.findUnique).not.toHaveBeenCalled();
    expect(prisma.plantas.create.mock.calls[0][0].data).toMatchObject({
      nome: 'Fazenda',
      cnpj: null,
      cep: null,
      cidade: null,
      proprietario_id: null,
    });
  });

  it('o cliente não tira o dono da própria planta (o vazio também é passar adiante)', () => {
    const cliente = { id: 'cli1', role: 'proprietario' };
    expect(problemaNoDono(cliente, null, 'cli1')).toBe(NAO_PASSA_A_OUTRO_DONO);
    expect(problemaNoDono(cliente, undefined, 'cli1')).toBeNull();
    expect(problemaNoDono(cliente, 'cli1', 'cli1')).toBeNull();
  });

  it('planta nova (undefined) e planta existente sem dono (null) não se confundem', () => {
    const cliente = { id: 'cli1', role: 'proprietario' };
    expect(problemaNoDono(cliente, 'cli1', undefined)).toBeNull();
    expect(problemaNoDono(cliente, null, undefined)).toBe(SO_EM_NOME_PROPRIO);
    // A sem dono não vira dele por "criar em nome próprio"
    expect(problemaNoDono(cliente, 'cli1', null)).toBe(NAO_PASSA_A_OUTRO_DONO);
    expect(problemaNoDono(cliente, undefined, null)).toBeNull();
  });
});

describe('instalação sem campos obrigatórios', () => {
  it('só com o nome e a planta passa', async () => {
    await expect(validar(CreateUnidadeDto, { planta_id: 'p1', nome: 'UFV 1' })).resolves.toMatchObject({ nome: 'UFV 1' });
  });

  it('o nome e a planta continuam obrigatórios', async () => {
    await expect(validar(CreateUnidadeDto, { nome: 'UFV 1' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar(CreateUnidadeDto, { planta_id: 'p1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coordenada e potência vazias são null, nunca 0', async () => {
    const dto = await validar(CreateUnidadeDto, { planta_id: 'p1', nome: 'UFV', latitude: '', longitude: '', potencia: '', tipo: '', estado: '', cidade: '' });
    expect(dto).toMatchObject({ latitude: null, longitude: null, potencia: null, tipo: null, estado: null, cidade: null });
  });

  it('o que vier é conferido', async () => {
    await expect(validar(CreateUnidadeDto, { planta_id: 'p1', nome: 'UFV', latitude: 120 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar(UpdateUnidadeDto, { tipo: 'UFV' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

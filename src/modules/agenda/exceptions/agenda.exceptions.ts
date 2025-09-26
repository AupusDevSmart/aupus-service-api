import { HttpException, HttpStatus } from '@nestjs/common';

export class FeriadoNaoEncontradoException extends HttpException {
  constructor(id: string) {
    super(`Feriado com ID ${id} não encontrado`, HttpStatus.NOT_FOUND);
  }
}

export class FeriadoJaExisteException extends HttpException {
  constructor(data: string) {
    super(`Já existe um feriado na data ${data}`, HttpStatus.CONFLICT);
  }
}

export class ConfiguracaoNaoEncontradaException extends HttpException {
  constructor(id: string) {
    super(`Configuração de dias úteis com ID ${id} não encontrada`, HttpStatus.NOT_FOUND);
  }
}

export class ConfiguracaoJaExisteException extends HttpException {
  constructor(nome: string) {
    super(`Já existe uma configuração com o nome "${nome}"`, HttpStatus.CONFLICT);
  }
}

export class PlantasNaoEncontradasException extends HttpException {
  constructor() {
    super('Uma ou mais plantas não foram encontradas', HttpStatus.BAD_REQUEST);
  }
}

export class AssociacaoInvalidaException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}
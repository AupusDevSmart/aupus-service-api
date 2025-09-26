// src/modules/tarefas/exceptions/tarefas.exceptions.ts
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

export class TarefaNaoEncontradaException extends NotFoundException {
  constructor(id?: string) {
    super(
      id 
        ? `Tarefa com ID "${id}" não encontrada`
        : 'Tarefa não encontrada'
    );
  }
}

export class TagJaExisteException extends ConflictException {
  constructor(tag: string) {
    super(`A TAG "${tag}" já está sendo utilizada por outra tarefa`);
  }
}

export class OrdemJaExisteException extends ConflictException {
  constructor(ordem: number) {
    super(`A ordem ${ordem} já está sendo utilizada por outra tarefa neste plano`);
  }
}

export class FrequenciaInvalidaException extends BadRequestException {
  constructor(mensagem: string) {
    super(`Erro na configuração de frequência: ${mensagem}`);
  }
}

export class PlanoNaoEncontradoException extends NotFoundException {
  constructor(id?: string) {
    super(
      id 
        ? `Plano de manutenção com ID "${id}" não encontrado`
        : 'Plano de manutenção não encontrado'
    );
  }
}

export class ArquivoInvalidoException extends BadRequestException {
  constructor(motivo: string) {
    super(`Arquivo inválido: ${motivo}`);
  }
}
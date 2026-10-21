/**
 * As pessoas do seed, uma por papel do PCM (os 64 usuários do dev ficam como
 * estão). O e-mail é do domínio reservado `.example`: não existe caixa de
 * correio do outro lado, e o seed não envia e-mail de qualquer forma.
 */
export type Papel = 'admin' | 'gerente' | 'analista' | 'operador' | 'proprietario';

export interface PessoaDoSeed {
  chave: string;
  nome: string;
  papel: Papel;
  cargo: string;
  cidade: string;
}

export const PESSOAS: PessoaDoSeed[] = [
  { chave: 'patricia', nome: 'Patrícia Nunes', papel: 'admin', cargo: 'Administradora do sistema', cidade: 'Goiânia' },
  { chave: 'marcos', nome: 'Marcos Vieira', papel: 'gerente', cargo: 'Gerente de manutenção', cidade: 'Goiânia' },
  { chave: 'renata', nome: 'Renata Albuquerque', papel: 'analista', cargo: 'Engenheira de planejamento', cidade: 'Goiânia' },
  { chave: 'felipe', nome: 'Felipe Duarte', papel: 'analista', cargo: 'Planejador de manutenção', cidade: 'Goiânia' },

  { chave: 'carlos', nome: 'Carlos Mendes', papel: 'operador', cargo: 'Técnico em eletrotécnica', cidade: 'Rio Verde' },
  { chave: 'joao', nome: 'João Pedro Alves', papel: 'operador', cargo: 'Eletricista de manutenção', cidade: 'Anápolis' },
  { chave: 'rafael', nome: 'Rafael Souza', papel: 'operador', cargo: 'Técnico em eletrotécnica', cidade: 'Goiânia' },
  { chave: 'lucas', nome: 'Lucas Ferreira', papel: 'operador', cargo: 'Mecânico de manutenção', cidade: 'Anápolis' },
  { chave: 'bruno', nome: 'Bruno Costa', papel: 'operador', cargo: 'Eletricista de manutenção', cidade: 'Goiânia' },
  { chave: 'thiago', nome: 'Thiago Martins', papel: 'operador', cargo: 'Técnico em eletrotécnica', cidade: 'Aparecida de Goiânia' },
  { chave: 'andre', nome: 'André Lima', papel: 'operador', cargo: 'Eletricista de manutenção', cidade: 'Cristalina' },
  { chave: 'gustavo', nome: 'Gustavo Ribeiro', papel: 'operador', cargo: 'Auxiliar de manutenção', cidade: 'Rio Verde' },

  { chave: 'helena', nome: 'Helena Prado', papel: 'proprietario', cargo: 'Gerente de operação da usina', cidade: 'Rio Verde' },
  { chave: 'rogerio', nome: 'Rogério Tavares', papel: 'proprietario', cargo: 'Coordenador de utilidades', cidade: 'Anápolis' },
  { chave: 'claudia', nome: 'Cláudia Nogueira', papel: 'proprietario', cargo: 'Gestora de infraestrutura hospitalar', cidade: 'Goiânia' },
  { chave: 'marcelo', nome: 'Marcelo Bastos', papel: 'proprietario', cargo: 'Administrador da fazenda', cidade: 'Cristalina' },
  { chave: 'simone', nome: 'Simone Araújo', papel: 'proprietario', cargo: 'Gerente de facilities', cidade: 'Aparecida de Goiânia' },
];

export const emailDe = (pessoa: Pick<PessoaDoSeed, 'nome'>, dominio: string) =>
  `${pessoa.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(' ')
    .filter((p) => p.length > 0)
    .filter((_, i, partes) => i === 0 || i === partes.length - 1)
    .join('.')}@${dominio}`;

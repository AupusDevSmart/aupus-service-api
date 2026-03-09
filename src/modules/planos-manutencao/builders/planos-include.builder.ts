// src/modules/planos-manutencao/builders/planos-include.builder.ts

export class PlanosIncludeBuilder {
  /**
   * Include básico com relacionamentos padrão
   */
  static relacionamentosBasicos() {
    return {
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true,
          unidade: {
            select: {
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
            }
          }
        }
      },
      usuario_criador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      },
      usuario_atualizador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      }
    };
  }

  /**
   * Include com contagem de tarefas
   */
  static comContagemTarefas() {
    return {
      ...this.relacionamentosBasicos(),
      _count: {
        select: {
          tarefas: {
            where: { deleted_at: null }
          }
        }
      }
    };
  }

  /**
   * Include completo com tarefas detalhadas
   */
  static comTarefasDetalhadas() {
    return {
      ...this.relacionamentosBasicos(),
      tarefas: {
        where: { deleted_at: null },
        include: {
          _count: {
            select: {
              sub_tarefas: true,
              recursos: true,
              anexos: true
            }
          }
        },
        orderBy: { ordem: 'asc' }
      }
    };
  }

  /**
   * Include para duplicação (com sub-tarefas, recursos e anexos)
   */
  static paraDuplicacao() {
    return {
      tarefas: {
        where: { deleted_at: null },
        include: {
          sub_tarefas: true,
          recursos: true,
          anexos: true
        }
      },
      equipamento: {
        select: { nome: true }
      }
    };
  }

  /**
   * Include para busca por planta/unidade
   */
  static porPlantaOuUnidade(incluirTarefas = false) {
    const base: any = {
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true,
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
            }
          }
        }
      },
      usuario_criador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      },
      _count: {
        select: {
          tarefas: {
            where: { deleted_at: null }
          }
        }
      }
    };

    if (incluirTarefas) {
      base.tarefas = {
        where: { deleted_at: null },
        include: {
          _count: {
            select: {
              sub_tarefas: true,
              recursos: true,
              anexos: true
            }
          }
        },
        orderBy: { ordem: 'asc' }
      };
    }

    return base;
  }
}

# 📅 Módulo Agenda - Documentação de Endpoints

Sistema completo para gerenciamento de feriados, dias úteis e calendário corporativo.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Feriados](#feriados)
  - [Criar Feriado](#criar-feriado)
  - [Listar Feriados](#listar-feriados)
  - [Buscar Feriado](#buscar-feriado)
  - [Atualizar Feriado](#atualizar-feriado)
  - [Remover Feriado](#remover-feriado)
  - [Associar Plantas](#associar-plantas-ao-feriado)
  - [Desassociar Planta](#desassociar-planta-do-feriado)
- [Configurações de Dias Úteis](#configurações-de-dias-úteis)
  - [Criar Configuração](#criar-configuração)
  - [Listar Configurações](#listar-configurações)
  - [Buscar Configuração](#buscar-configuração)
  - [Atualizar Configuração](#atualizar-configuração)
  - [Remover Configuração](#remover-configuração)
  - [Associar Plantas à Configuração](#associar-plantas-à-configuração)
- [Utilitários](#utilitários)
  - [Verificar Dia Útil](#verificar-dia-útil)
  - [Próximos Dias Úteis](#próximos-dias-úteis)
  - [Calendário do Mês](#calendário-do-mês)
- [Modelos de Dados](#modelos-de-dados)
- [Casos de Uso](#casos-de-uso)

## 🎯 Visão Geral

O módulo Agenda fornece funcionalidades para:
- **Gerenciar feriados** (nacionais, estaduais, municipais, personalizados)
- **Configurar dias úteis** por planta ou globalmente
- **Verificar datas** e calcular dias úteis
- **Gerar calendários** com informações detalhadas

**Base URL**: `/api/v1/agenda`

---

# 📅 Feriados

Os feriados podem ser **gerais** (aplicam-se a todas as plantas) ou **específicos** (apenas para plantas selecionadas).

## Criar Feriado

**Funcionalidade**: Cadastrar novos feriados no sistema

**Endpoint**: `POST /agenda/feriados`

**Papel**: Permite criar feriados que podem ser aplicados globalmente ou a plantas específicas

### Request Body:
```json
{
  "nome": "Natal",
  "data": "2024-12-25",
  "tipo": "NACIONAL",
  "geral": true,
  "recorrente": true,
  "descricao": "Feriado nacional comemorativo do nascimento de Jesus Cristo",
  "plantaIds": []
}
```

### Campos:
- **nome** *(string, obrigatório)*: Nome do feriado
- **data** *(date, obrigatório)*: Data do feriado (YYYY-MM-DD)
- **tipo** *(enum, obrigatório)*: `NACIONAL | ESTADUAL | MUNICIPAL | PERSONALIZADO`
- **geral** *(boolean, opcional)*: `true` = aplica a todas as plantas, `false` = apenas plantas específicas
- **recorrente** *(boolean, opcional)*: Se repete anualmente
- **descricao** *(string, opcional)*: Descrição adicional
- **plantaIds** *(string[], obrigatório se geral=false)*: IDs das plantas (ignorado se geral=true)

### Response (201):
```json
{
  "id": "fer_01234567890123456789012345",
  "nome": "Natal",
  "data": "2024-12-25T00:00:00.000Z",
  "tipo": "NACIONAL",
  "geral": true,
  "recorrente": true,
  "descricao": "Feriado nacional comemorativo do nascimento de Jesus Cristo",
  "ativo": true,
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "plantas": [],
  "total_plantas": null
}
```

---

## Listar Feriados

**Funcionalidade**: Consultar feriados com filtros avançados e paginação

**Endpoint**: `GET /agenda/feriados`

**Papel**: Interface principal para consulta de feriados, essencial para dashboards e telas de listagem

### Query Parameters:
- **page** *(number, opcional)*: Página atual (padrão: 1)
- **limit** *(number, opcional)*: Itens por página (padrão: 10, máx: 100)
- **search** *(string, opcional)*: Busca por nome ou descrição
- **tipo** *(enum, opcional)*: Filtrar por tipo de feriado
- **plantaId** *(string, opcional)*: Feriados de uma planta específica (inclui gerais)
- **ano** *(number, opcional)*: Filtrar por ano (ex: 2024)
- **mes** *(number, opcional)*: Filtrar por mês (1-12, requer ano)
- **geral** *(boolean, opcional)*: Apenas feriados gerais (true) ou específicos (false)
- **recorrente** *(boolean, opcional)*: Apenas feriados recorrentes
- **orderBy** *(string, opcional)*: Campo de ordenação (`nome | data | tipo | created_at`)
- **orderDirection** *(string, opcional)*: Direção (`asc | desc`)

### Exemplo de Request:
```
GET /agenda/feriados?page=1&limit=10&ano=2024&tipo=NACIONAL&geral=true&orderBy=data&orderDirection=asc
```

### Response (200):
```json
{
  "data": [
    {
      "id": "fer_01234567890123456789012345",
      "nome": "Natal",
      "data": "2024-12-25T00:00:00.000Z",
      "tipo": "NACIONAL",
      "geral": true,
      "recorrente": true,
      "descricao": "Feriado nacional",
      "ativo": true,
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z",
      "plantas": [],
      "total_plantas": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

**💡 Casos de Uso**:
- Dashboard com feriados do mês atual
- Lista de feriados para uma planta específica
- Busca de feriados por nome
- Calendário anual de feriados

---

## Buscar Feriado

**Funcionalidade**: Obter detalhes completos de um feriado específico

**Endpoint**: `GET /agenda/feriados/:id`

**Papel**: Tela de detalhes/edição de feriados

### Response (200):
```json
{
  "id": "fer_01234567890123456789012345",
  "nome": "Consciência Negra - Goiânia",
  "data": "2024-11-20T00:00:00.000Z",
  "tipo": "MUNICIPAL",
  "geral": false,
  "recorrente": true,
  "descricao": "Feriado municipal de Goiânia",
  "ativo": true,
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "plantas": [
    {
      "id": "plt_01234567890123456789012345",
      "nome": "Planta Goiânia Centro",
      "cnpj": "12.345.678/0001-90",
      "cidade": "Goiânia"
    }
  ],
  "total_plantas": 1
}
```

---

## Atualizar Feriado

**Funcionalidade**: Modificar dados de um feriado existente

**Endpoint**: `PUT /agenda/feriados/:id`

**Papel**: Permite correções e ajustes em feriados cadastrados

### Request Body:
```json
{
  "nome": "Consciência Negra",
  "descricao": "Descrição atualizada",
  "geral": false,
  "plantaIds": ["plt_01234567890123456789012345", "plt_98765432109876543210987654"]
}
```

**💡 Importante**:
- Campos não enviados permanecem inalterados
- Mudar `geral` de `true` para `false` permite especificar plantas
- Mudar de `false` para `true` remove todas as associações de plantas

---

## Remover Feriado

**Funcionalidade**: Desativar um feriado (soft delete)

**Endpoint**: `DELETE /agenda/feriados/:id`

**Papel**: Permite "excluir" feriados sem perder histórico

### Response (204):
```
No Content
```

**💡 Nota**: O feriado fica inativo (`ativo: false`) mas permanece no banco para auditoria.

---

## Associar Plantas ao Feriado

**Funcionalidade**: Definir quais plantas são afetadas por um feriado específico

**Endpoint**: `POST /agenda/feriados/:id/plantas`

**Papel**: Gerenciar scope de feriados específicos

### Request Body:
```json
{
  "plantaIds": ["plt_01234567890123456789012345", "plt_98765432109876543210987654"]
}
```

### Response (200):
```json
{
  "id": "fer_01234567890123456789012345",
  "nome": "Feriado Municipal",
  "geral": false,
  "plantas": [
    {
      "id": "plt_01234567890123456789012345",
      "nome": "Planta A",
      "cnpj": "12.345.678/0001-90",
      "cidade": "São Paulo"
    }
  ],
  "total_plantas": 1
}
```

**💡 Importante**: Substitui todas as associações existentes pelas novas.

---

## Desassociar Planta do Feriado

**Funcionalidade**: Remover uma planta específica de um feriado

**Endpoint**: `DELETE /agenda/feriados/:id/plantas/:plantaId`

**Papel**: Ajustes pontuais em associações

### Response (204):
```
No Content
```

---

# ⚙️ Configurações de Dias Úteis

Define quais dias da semana são considerados úteis para cada planta ou globalmente.

## Criar Configuração

**Funcionalidade**: Criar nova configuração de dias úteis

**Endpoint**: `POST /agenda/configuracoes-dias-uteis`

**Papel**: Definir regras de funcionamento para diferentes tipos de operação

### Request Body:
```json
{
  "nome": "Horário Industrial 24h",
  "descricao": "Para plantas que operam continuamente",
  "segunda": true,
  "terca": true,
  "quarta": true,
  "quinta": true,
  "sexta": true,
  "sabado": true,
  "domingo": true,
  "geral": false,
  "plantaIds": ["plt_01234567890123456789012345"]
}
```

### Campos:
- **nome** *(string, obrigatório)*: Nome da configuração
- **descricao** *(string, opcional)*: Descrição detalhada
- **segunda/terca/quarta/quinta/sexta** *(boolean, opcional)*: Dias úteis (padrão: true)
- **sabado/domingo** *(boolean, opcional)*: Fins de semana (padrão: false)
- **geral** *(boolean, opcional)*: Se aplica a todas as plantas
- **plantaIds** *(string[], obrigatório se geral=false)*: IDs das plantas

### Response (201):
```json
{
  "id": "cfg_01234567890123456789012345",
  "nome": "Horário Industrial 24h",
  "descricao": "Para plantas que operam continuamente",
  "segunda": true,
  "terca": true,
  "quarta": true,
  "quinta": true,
  "sexta": true,
  "sabado": true,
  "domingo": true,
  "geral": false,
  "ativo": true,
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "plantas": [
    {
      "id": "plt_01234567890123456789012345",
      "nome": "Planta Industrial SP",
      "cnpj": "12.345.678/0001-90",
      "cidade": "São Paulo"
    }
  ],
  "total_plantas": 1,
  "total_dias_uteis": 7,
  "dias_uteis_semana": ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
}
```

---

## Listar Configurações

**Funcionalidade**: Consultar configurações existentes

**Endpoint**: `GET /agenda/configuracoes-dias-uteis`

**Papel**: Interface para gerenciar configurações de dias úteis

### Query Parameters:
- **page** *(number)*: Página atual
- **limit** *(number)*: Itens por página
- **search** *(string)*: Busca por nome ou descrição
- **plantaId** *(string)*: Configurações de uma planta
- **geral** *(boolean)*: Apenas configurações gerais
- **sabado** *(boolean)*: Que incluem sábado
- **domingo** *(boolean)*: Que incluem domingo
- **orderBy** *(string)*: `nome | created_at | total_dias_uteis`
- **orderDirection** *(string)*: `asc | desc`

### Response (200):
```json
{
  "data": [
    {
      "id": "cfg_01234567890123456789012345",
      "nome": "Horário Comercial Padrão",
      "geral": true,
      "total_dias_uteis": 5,
      "dias_uteis_semana": ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
      "total_plantas": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

---

## Buscar Configuração

**Funcionalidade**: Obter detalhes de uma configuração

**Endpoint**: `GET /agenda/configuracoes-dias-uteis/:id`

**Papel**: Tela de detalhes/edição de configurações

---

## Atualizar Configuração

**Funcionalidade**: Modificar configuração existente

**Endpoint**: `PUT /agenda/configuracoes-dias-uteis/:id`

**Papel**: Ajustar regras de funcionamento

---

## Remover Configuração

**Funcionalidade**: Desativar configuração

**Endpoint**: `DELETE /agenda/configuracoes-dias-uteis/:id`

**Papel**: Remover configurações obsoletas

---

## Associar Plantas à Configuração

**Funcionalidade**: Definir quais plantas usam uma configuração

**Endpoint**: `POST /agenda/configuracoes-dias-uteis/:id/plantas`

**Papel**: Gerenciar scope de configurações específicas

---

# 🛠️ Utilitários

Funções essenciais para cálculos de calendário e verificações.

## Verificar Dia Útil

**Funcionalidade**: Verificar se uma data específica é dia útil

**Endpoint**: `GET /agenda/verificar-dia-util`

**Papel**: Validação crítica para sistemas de prazos, agendamentos e cronogramas

### Query Parameters:
- **data** *(string, obrigatório)*: Data no formato YYYY-MM-DD
- **plantaId** *(string, opcional)*: ID da planta para regras específicas

### Exemplo:
```
GET /agenda/verificar-dia-util?data=2024-12-25&plantaId=plt_01234567890123456789012345
```

### Response (200):
```json
{
  "data": "2024-12-25T00:00:00.000Z",
  "ehDiaUtil": false,
  "ehFeriado": true,
  "nomeFeriado": "Natal",
  "diaSemana": "Quarta",
  "configuracao": {
    "id": "cfg_01234567890123456789012345",
    "nome": "Horário Comercial Padrão"
  }
}
```

**💡 Casos de Uso**:
- Validar datas de vencimento
- Bloquear agendamentos em feriados
- Calcular prazos de projetos
- Sistemas de ponto eletrônico

---

## Próximos Dias Úteis

**Funcionalidade**: Obter os próximos N dias úteis a partir de uma data

**Endpoint**: `GET /agenda/proximos-dias-uteis`

**Papel**: Cálculo de prazos e agendamentos futuros

### Query Parameters:
- **quantidade** *(number, obrigatório)*: Quantos dias úteis retornar
- **dataInicio** *(string, opcional)*: Data de início (padrão: hoje)
- **plantaId** *(string, opcional)*: Para regras específicas da planta

### Exemplo:
```
GET /agenda/proximos-dias-uteis?quantidade=5&dataInicio=2024-01-15&plantaId=plt_01234567890123456789012345
```

### Response (200):
```json
{
  "diasUteis": [
    "2024-01-16T00:00:00.000Z",
    "2024-01-17T00:00:00.000Z",
    "2024-01-18T00:00:00.000Z",
    "2024-01-19T00:00:00.000Z",
    "2024-01-22T00:00:00.000Z"
  ],
  "diasEncontrados": 5,
  "dataInicio": "2024-01-15T00:00:00.000Z",
  "configuracaoUsada": {
    "id": "cfg_01234567890123456789012345",
    "nome": "Horário Comercial Padrão"
  }
}
```

**💡 Casos de Uso**:
- Calcular datas de entrega
- Agendar próximas manutenções
- Definir marcos de projeto
- Planejamento de produção

---

## Calendário do Mês

**Funcionalidade**: Obter calendário completo com informações de dias úteis

**Endpoint**: `GET /agenda/calendario/:ano/:mes`

**Papel**: Interface de calendário rico para dashboards e planejamento

### Path Parameters:
- **ano** *(number)*: Ano (ex: 2024)
- **mes** *(number)*: Mês de 1 a 12

### Query Parameters:
- **plantaId** *(string, opcional)*: Para regras específicas da planta

### Exemplo:
```
GET /agenda/calendario/2024/12?plantaId=plt_01234567890123456789012345
```

### Response (200):
```json
[
  {
    "data": "2024-12-01T00:00:00.000Z",
    "ehDiaUtil": false,
    "ehFeriado": false,
    "diaSemana": "Domingo",
    "configuracao": {
      "id": "cfg_01234567890123456789012345",
      "nome": "Horário Comercial Padrão"
    }
  },
  {
    "data": "2024-12-25T00:00:00.000Z",
    "ehDiaUtil": false,
    "ehFeriado": true,
    "nomeFeriado": "Natal",
    "diaSemana": "Quarta",
    "configuracao": {
      "id": "cfg_01234567890123456789012345",
      "nome": "Horário Comercial Padrão"
    }
  }
]
```

**💡 Casos de Uso**:
- Widget de calendário no dashboard
- Tela de planejamento mensal
- Visão geral de feriados e dias úteis
- Planejamento de equipes

---

# 📊 Modelos de Dados

## FeriadoResponse
```typescript
{
  id: string;
  nome: string;
  data: Date;
  tipo: 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL' | 'PERSONALIZADO';
  geral: boolean;
  recorrente: boolean;
  descricao?: string;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
  plantas?: PlantaResumo[];
  total_plantas?: number;
}
```

## ConfiguracaoResponse
```typescript
{
  id: string;
  nome: string;
  descricao?: string;
  segunda: boolean;
  terca: boolean;
  quarta: boolean;
  quinta: boolean;
  sexta: boolean;
  sabado: boolean;
  domingo: boolean;
  geral: boolean;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
  plantas?: PlantaResumo[];
  total_plantas?: number;
  total_dias_uteis: number;
  dias_uteis_semana: string[];
}
```

## PlantaResumo
```typescript
{
  id: string;
  nome: string;
  cnpj: string;
  cidade: string;
}
```

---

# 🎯 Casos de Uso

## 1. Dashboard Principal
**Endpoints necessários**:
- `GET /agenda/feriados?mes=12&ano=2024&limit=5` - Próximos feriados
- `GET /agenda/verificar-dia-util?data=hoje` - Status do dia atual
- `GET /agenda/proximos-dias-uteis?quantidade=3` - Próximos 3 dias úteis

## 2. Tela de Planejamento de Projeto
**Endpoints necessários**:
- `GET /agenda/proximos-dias-uteis?quantidade=10&dataInicio=2024-01-15` - Calcular prazo
- `GET /agenda/verificar-dia-util` - Validar marcos importantes

## 3. Configuração de Planta
**Endpoints necessários**:
- `GET /agenda/configuracoes-dias-uteis?plantaId=plt_123` - Configuração atual
- `GET /agenda/feriados?plantaId=plt_123` - Feriados que afetam a planta
- `POST /agenda/configuracoes-dias-uteis` - Criar configuração específica

## 4. Gestão de Feriados Corporativos
**Endpoints necessários**:
- `POST /agenda/feriados` - Cadastrar novos feriados
- `GET /agenda/feriados?geral=false` - Listar feriados específicos
- `PUT /agenda/feriados/:id` - Ajustar feriados
- `POST /agenda/feriados/:id/plantas` - Gerenciar scope

## 5. Calendário Interativo
**Endpoints necessários**:
- `GET /agenda/calendario/2024/12` - Dados do mês
- `GET /agenda/feriados?mes=12&ano=2024` - Detalhes dos feriados

---

## ⚠️ Códigos de Erro

- **400**: Dados inválidos, plantas não encontradas
- **404**: Feriado/configuração não encontrada
- **409**: Conflito (feriado já existe na data, nome duplicado)

---

## 📋 Headers Importantes

- **Content-Type**: `application/json`
- **Accept**: `application/json`

Esta documentação fornece todos os detalhes necessários para implementar o frontend do sistema de agenda! 🚀
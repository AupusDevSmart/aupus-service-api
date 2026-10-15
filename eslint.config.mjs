// Espelha o config do AupusService (frontend), que e o unico que ja existia no
// monorepo: mesmas versoes, mesma base (`recommended`, nao `recommendedTypeChecked`)
// e a mesma regra de import morto. As diferencas sao so as de ambiente — globais
// de Node e de Jest no lugar das de browser, e nenhum plugin de React.
//
// `recommended` e nao `recommendedTypeChecked` de proposito: a variante com
// tipos liga a familia `no-unsafe-*`, que num codigo que trafega `any` por
// convencao acusa milhares de linhas. Um lint que nasce com esse volume nao e
// executado por ninguem, e o que pega defeito de verdade (variavel morta, case
// sem bloco, promessa solta) ja esta no `recommended`.
//
// Formatacao fica fora: o `prettier` existe para o script `format`, e nao como
// regra de lint. Com plugin de prettier, todo arquivo nunca formatado vira erro
// e o sinal util some no meio.
import js from '@eslint/js';
import globals from 'globals';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'generated', 'node_modules', 'eslint.config.mjs'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      // `any` zerado no SN-36 (out/2026): 671 em 158 arquivos, a maioria
      // escondendo coluna que nao existe ou tipo errado. ERRO para nao voltar:
      // linha do Prisma tem tipo (`Prisma.<model>GetPayload`), Json e
      // `Prisma.JsonValue`, valor arbitrario e `unknown` com narrowing.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
    },
  },
);

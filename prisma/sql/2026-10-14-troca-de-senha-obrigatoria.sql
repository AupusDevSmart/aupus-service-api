-- SN-34: troca de senha obrigatória no primeiro acesso.
--
-- Todo usuário nascia com a senha fixa "Aupus123!" e a tela prometia uma troca
-- no primeiro acesso que não existia. Agora o usuário novo (e quem tem a senha
-- redefinida por outra pessoa) fica marcado, e o backend só deixa fazer login,
-- ver o próprio usuário e trocar a senha até ele trocar.
--
-- Quem AINDA usa a senha padrão é marcado pelo script
-- scripts/db/marcar-senha-padrao.ts (compara o hash; SQL não sabe fazer).
--
-- Idempotente. Não viaja para o NexOn (lista NUNCA_VIAJAM da sincronização).

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS deve_trocar_senha boolean NOT NULL DEFAULT false;

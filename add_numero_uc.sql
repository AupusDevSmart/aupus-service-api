-- Adicionar coluna numero_uc em plantas
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS numero_uc VARCHAR(255);

-- Adicionar coluna numero_uc em unidades
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS numero_uc VARCHAR(255);

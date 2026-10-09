-- O papel "authenticated" não tinha privilégios nas tabelas do schema public,
-- por isso a app não conseguia ler user_roles/profiles (todos apareciam como estudante).
-- O acesso às linhas continua controlado pelas políticas RLS (ativas em todas as tabelas).
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- Tabelas criadas no futuro também ficam acessíveis (sempre com RLS)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- RASCUNHO BLOQUEADO. NÃO EXECUTAR.
-- Pré-requisitos: docs/arquitetura-usuarios-etapa1.md.
-- Remover esta trava SOMENTE após revisão do esquema e autorização de aplicação.
BEGIN;

DO $migration_guard$
BEGIN
  RAISE EXCEPTION 'Migração bloqueada: confirme o esquema e autorize a aplicação antes de remover esta trava.';
END;
$migration_guard$;

-- Sem IF NOT EXISTS: colisões devem interromper a aplicação para revisão.
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'usuario'
    CONSTRAINT user_roles_role_check CHECK (role IN ('usuario', 'parceiro', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

CREATE POLICY user_roles_select_own
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Sem INSERT/UPDATE/DELETE ou políticas de escrita para clientes.
-- Nenhum usuário é promovido ou criado por esta migração.
-- Provisionamento privilegiado/auditado será definido em etapa posterior.
COMMIT;

-- REVIEW CANDIDATE. Derived from 20261113_admin_access_foundation_v1_blocked.sql
-- and the RA-11 access/recovery specification, using the supplied PG17.6 catalog.
-- Not executed. Keep this source blocked; approve a complete deployment copy.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $approval$ BEGIN
  RAISE EXCEPTION 'BLOCKED: foundation v2 requires explicit deployment approval and staging validation';
END $approval$;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> current_user OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolcreaterole
  ) OR EXISTS (
    SELECT 1 FROM pg_class WHERE oid IN ('public.user_roles'::regclass,
      'public.locais'::regclass,'public.roleapp_admin_audit'::regclass)
      AND relowner <> (SELECT oid FROM pg_roles WHERE rolname=current_user)
  ) OR NOT has_schema_privilege(current_user,'roleapp_security','CREATE') THEN
    RAISE EXCEPTION 'Expected trusted CREATEROLE installer and ownership were not confirmed';
  END IF;
  IF to_regclass('roleapp_security.admin_access') IS NOT NULL OR
     to_regclass('roleapp_security.admin_capability_grants') IS NOT NULL OR
     to_regprocedure('roleapp_security.admin_actor_id()') IS NOT NULL OR
     EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roleapp_admin_executor') THEN
    RAISE EXCEPTION 'Foundation collision: review an incremental change instead';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles r CROSS JOIN pg_namespace n
    WHERE r.rolname IN ('anon','authenticated','service_role','authenticator')
      AND n.nspname IN ('public','roleapp_security')
      AND has_schema_privilege(r.oid,n.oid,'CREATE')) THEN
    RAISE EXCEPTION 'Untrusted schema CREATE must be resolved separately';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles r
    WHERE r.rolname IN ('anon','authenticated') AND (
      r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR
      pg_has_role(r.oid,'postgres','MEMBER') OR
      has_any_column_privilege(r.oid,'public.user_roles','INSERT') OR
      has_any_column_privilege(r.oid,'public.user_roles','UPDATE') OR
      has_table_privilege(r.oid,'public.user_roles','DELETE') OR
      has_table_privilege(r.oid,'public.user_roles','TRUNCATE'))) THEN
    RAISE EXCEPTION 'Client can mutate the authoritative role source';
  END IF;
  IF NOT has_schema_privilege(current_user,'auth','USAGE') OR
     NOT has_function_privilege(current_user,'auth.uid()','EXECUTE') OR
     NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='auth.uid()'::regprocedure
       AND md5(pg_get_functiondef(oid))='ea3b41bf29e2ad573067939329aa088e') THEN
    RAISE EXCEPTION 'Trusted auth.uid dependency differs from the supplied catalog';
  END IF;
END $preflight$;

CREATE ROLE roleapp_admin_executor NOLOGIN NOINHERIT NOBYPASSRLS
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
-- PG17 non-superuser ownership transfer needs SET ROLE and schema CREATE.
-- Both are temporary within this transaction, removed before COMMIT.
GRANT roleapp_admin_executor TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public,roleapp_security TO roleapp_admin_executor;
GRANT CREATE ON SCHEMA roleapp_security TO roleapp_admin_executor;
-- postgres has auth USAGE but no grant option in the supplied schema ACL.
-- This narrow bridge is owned by the existing trusted installer, never the
-- executor. It returns only the existing auth.uid() result, takes no parameters
-- and accesses no table. No auth schema privilege/membership is expanded.
CREATE FUNCTION roleapp_security.admin_actor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $function$ SELECT auth.uid() $function$;
REVOKE ALL ON FUNCTION roleapp_security.admin_actor_id() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION roleapp_security.admin_actor_id() TO roleapp_admin_executor;

DO $ambient$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
    WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
      AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege('roleapp_admin_executor',c.oid,a.attnum,p.privilege)
  ) THEN RAISE EXCEPTION 'New executor has ambient PUBLIC relation privileges'; END IF;
END $ambient$;

CREATE TABLE roleapp_security.admin_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  principal boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  changed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000)
);
CREATE TABLE roleapp_security.admin_capability_grants (
  user_id uuid NOT NULL REFERENCES roleapp_security.admin_access(user_id) ON DELETE RESTRICT,
  capability text NOT NULL CHECK (capability IN (
    'locais.ler','locais.criar','locais.editar','locais.visibilidade','locais.moderar',
    'campanhas.ler','campanhas.criar','campanhas.editar','campanhas.aprovar',
    'campanhas.ativar','campanhas.pausar','campanhas.encerrar',
    'administradores.ler','administradores.gerenciar')),
  PRIMARY KEY(user_id,capability)
);
ALTER TABLE roleapp_security.admin_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_access FORCE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_capability_grants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON roleapp_security.admin_access,roleapp_security.admin_capability_grants
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(user_id,active,principal,version) ON roleapp_security.admin_access TO roleapp_admin_executor;
GRANT SELECT(user_id,capability) ON roleapp_security.admin_capability_grants TO roleapp_admin_executor;
GRANT SELECT(user_id,role) ON public.user_roles TO roleapp_admin_executor;
CREATE POLICY admin_executor_access_read ON roleapp_security.admin_access
  FOR SELECT TO roleapp_admin_executor USING (true);
CREATE POLICY admin_executor_grants_read ON roleapp_security.admin_capability_grants
  FOR SELECT TO roleapp_admin_executor USING (true);
CREATE POLICY admin_executor_roles_read ON public.user_roles
  FOR SELECT TO roleapp_admin_executor USING (true);

CREATE FUNCTION roleapp_security.admin_has_capability(p_capability text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM roleapp_security.admin_access a
    JOIN public.user_roles r ON r.user_id=a.user_id AND r.role='admin'
    JOIN roleapp_security.admin_capability_grants g ON g.user_id=a.user_id
    WHERE a.user_id=roleapp_security.admin_actor_id() AND a.active AND g.capability=p_capability
  )
$function$;
REVOKE ALL ON FUNCTION roleapp_security.admin_has_capability(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION roleapp_security.admin_has_capability(text) TO authenticated;
ALTER FUNCTION roleapp_security.admin_has_capability(text) OWNER TO roleapp_admin_executor;

-- One serialization point for bootstrap and all future access-management RPCs.
-- Protects direct trusted maintenance and existing role changes too. No clients
-- get private table DML. Auth deletion is blocked by the RESTRICT FK above.
CREATE FUNCTION roleapp_security.admin_protect_last_principal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE target uuid; removes_effective_access boolean := false;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Principal changes require READ COMMITTED serialization';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7331,20261114);
  target := OLD.user_id;
  IF TG_TABLE_NAME='user_roles' THEN
    removes_effective_access := TG_OP='DELETE';
    IF TG_OP='UPDATE' THEN
      removes_effective_access := NEW.role<>'admin' OR NEW.user_id<>OLD.user_id;
    END IF;
  ELSIF TG_TABLE_NAME='admin_access' THEN
    removes_effective_access := TG_OP='DELETE';
    IF TG_OP='UPDATE' THEN
      IF NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Admin identity is immutable'; END IF;
      removes_effective_access := NOT NEW.active OR NOT NEW.principal;
      NEW.version := OLD.version+1;
      NEW.changed_at := pg_catalog.clock_timestamp();
    END IF;
  ELSE
    removes_effective_access := OLD.capability='administradores.gerenciar';
    IF TG_OP='UPDATE' THEN
      removes_effective_access := removes_effective_access AND
        (NEW.user_id<>OLD.user_id OR NEW.capability<>OLD.capability);
    END IF;
  END IF;
  IF removes_effective_access AND EXISTS (
    SELECT 1 FROM roleapp_security.admin_access a
    JOIN public.user_roles r ON r.user_id=a.user_id AND r.role='admin'
    JOIN roleapp_security.admin_capability_grants g ON g.user_id=a.user_id
      AND g.capability='administradores.gerenciar'
    WHERE a.user_id=target AND a.active AND a.principal
  ) AND NOT EXISTS (
    SELECT 1 FROM roleapp_security.admin_access a
    JOIN public.user_roles r ON r.user_id=a.user_id AND r.role='admin'
    JOIN roleapp_security.admin_capability_grants g ON g.user_id=a.user_id
      AND g.capability='administradores.gerenciar'
    WHERE a.user_id<>target AND a.active AND a.principal
  ) THEN
    RAISE EXCEPTION 'Cannot remove the last effective principal' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION roleapp_security.admin_protect_last_principal()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_protect_role_principal BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.admin_protect_last_principal();
CREATE TRIGGER admin_protect_access_principal BEFORE UPDATE OR DELETE ON roleapp_security.admin_access
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.admin_protect_last_principal();
CREATE TRIGGER admin_protect_capability_principal BEFORE UPDATE OR DELETE ON roleapp_security.admin_capability_grants
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.admin_protect_last_principal();
ALTER FUNCTION roleapp_security.admin_protect_last_principal() OWNER TO roleapp_admin_executor;

REVOKE CREATE ON SCHEMA roleapp_security FROM roleapp_admin_executor;
-- Retain only trusted role administration, required by PG17 for later owner
-- transfers. postgres cannot inherit or SET ROLE without an explicit new grant.
GRANT roleapp_admin_executor TO postgres WITH SET FALSE;
DO $postflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE
    (m.roleid='roleapp_admin_executor'::regrole OR m.member='roleapp_admin_executor'::regrole)
    AND NOT (m.roleid='roleapp_admin_executor'::regrole AND m.member='postgres'::regrole
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
  ) OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roleapp_admin_executor'
    AND (rolcanlogin OR rolinherit OR rolbypassrls OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication)
  ) OR EXISTS (SELECT 1 FROM pg_class WHERE relowner='roleapp_admin_executor'::regrole
  ) OR EXISTS (SELECT 1 FROM pg_namespace WHERE has_schema_privilege('roleapp_admin_executor',oid,'CREATE')) THEN
    RAISE EXCEPTION 'Executor role isolation failed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE c.oid IN ('roleapp_security.admin_access'::regclass,'roleapp_security.admin_capability_grants'::regclass)
      AND x.grantee<>c.relowner
  ) OR EXISTS (SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE a.attrelid IN ('roleapp_security.admin_access'::regclass,'roleapp_security.admin_capability_grants'::regclass)
      AND (x.grantee<>'roleapp_admin_executor'::regrole OR x.privilege_type<>'SELECT' OR x.is_grantable)
  ) THEN RAISE EXCEPTION 'Unexpected private ACL/default privileges'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x
    WHERE p.oid IN ('roleapp_security.admin_has_capability(text)'::regprocedure,
                    'roleapp_security.admin_protect_last_principal()'::regprocedure)
      AND (x.grantee<>p.proowner AND (
        p.proname<>'admin_has_capability' OR x.grantee<>'authenticated'::regrole OR x.is_grantable))) THEN
    RAISE EXCEPTION 'Unexpected private function/default EXECUTE grant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='roleapp_security.admin_actor_id()'::regprocedure
      AND proowner='postgres'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog']) OR
     EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x
       WHERE p.oid='roleapp_security.admin_actor_id()'::regprocedure AND
        (x.grantee NOT IN (p.proowner,'roleapp_admin_executor'::regrole::oid) OR x.is_grantable)) THEN
    RAISE EXCEPTION 'Identity bridge owner/settings/ACL failed';
  END IF;
END $postflight$;
COMMIT;
-- No account, capability, principal or client write permission was provisioned.
-- Rollback/revoke proposal is a separate explicitly approved transaction.

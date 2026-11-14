-- MIGRACAO CANDIDATA VERSIONADA. Nao executada; nao incluir em db push.
-- Revisar catalogo/ACLs/FKs/triggers/views/RPCs e remover SOMENTE a trava abaixo
-- em uma copia aprovada. Nao aplicar 08_roles_legadas_blocked.sql: ha consumidores.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $approval$
BEGIN
  RAISE EXCEPTION 'BLOQUEADA: isolamento dos roles exige revisao e autorizacao de implantacao.';
END;
$approval$;

LOCK TABLE public.roles, public.roles_etapas IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.roles'::regclass
    AND attname='id_usuario' AND atttypid='uuid'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Confirmar roles.id_usuario uuid associado a auth.users.id';
  END IF;
  -- A FK simples deve estar validada: nenhuma etapa pode sobreviver sem pai.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1]
    WHERE c.conrelid='public.roles_etapas'::regclass AND c.confrelid='public.roles'::regclass
      AND c.contype='f' AND c.convalidated AND cardinality(c.conkey)=1
      AND a.attname='id_role' AND b.attname='id_role') THEN
    RAISE EXCEPTION 'Confirmar FK validada roles_etapas.id_role -> roles.id_role';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roles r LEFT JOIN auth.users u ON u.id=r.id_usuario
      WHERE u.id IS NULL) OR EXISTS (SELECT 1 FROM public.roles_etapas e
      LEFT JOIN public.roles r ON r.id_role=e.id_role WHERE r.id_role IS NULL) THEN
    RAISE EXCEPTION 'Dados sem proprietario/pai valido: revisar sem apagar nem atribuir donos automaticamente';
  END IF;
END;
$preflight$;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_etapas FORCE ROW LEVEL SECURITY;

-- Restritivas se combinam por AND com quaisquer policies permissivas anteriores.
-- Nao apagar policies desconhecidas. Postflight deve detectar negacoes legadas.
CREATE POLICY personal_roles_owner_boundary_v1 ON public.roles AS RESTRICTIVE
  FOR ALL TO PUBLIC
  USING (id_usuario=(SELECT auth.uid()))
  WITH CHECK (id_usuario=(SELECT auth.uid()));
CREATE POLICY personal_roles_owner_access_v1 ON public.roles AS PERMISSIVE
  FOR ALL TO authenticated
  USING (id_usuario=(SELECT auth.uid()))
  WITH CHECK (id_usuario=(SELECT auth.uid()));

CREATE POLICY personal_steps_owner_boundary_v1 ON public.roles_etapas AS RESTRICTIVE
  FOR ALL TO PUBLIC
  USING (EXISTS (SELECT 1 FROM public.roles r
    WHERE r.id_role=roles_etapas.id_role AND r.id_usuario=(SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.roles r
    WHERE r.id_role=roles_etapas.id_role AND r.id_usuario=(SELECT auth.uid())));
CREATE POLICY personal_steps_owner_access_v1 ON public.roles_etapas AS PERMISSIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.roles r
    WHERE r.id_role=roles_etapas.id_role AND r.id_usuario=(SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.roles r
    WHERE r.id_role=roles_etapas.id_role AND r.id_usuario=(SELECT auth.uid())));

REVOKE ALL ON TABLE public.roles, public.roles_etapas FROM PUBLIC, anon, authenticated;
-- Sem TRUNCATE/REFERENCES/TRIGGER. Mantem RETURNING e o cliente atual.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles, public.roles_etapas TO authenticated;

-- SERIAL/IDENTITY, se existentes. Apenas sequencias pertencentes a estas tabelas.
DO $sequences$
DECLARE seq record;
BEGIN
  FOR seq IN SELECT DISTINCT ns.nspname, s.relname FROM pg_class s
    JOIN pg_namespace ns ON ns.oid=s.relnamespace
    JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass
    WHERE s.relkind='S' AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
      AND d.refobjid IN ('public.roles'::regclass,'public.roles_etapas'::regclass)
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC, anon, authenticated',seq.nspname,seq.relname);
    EXECUTE format('GRANT USAGE ON SEQUENCE %I.%I TO authenticated',seq.nspname,seq.relname);
  END LOOP;
END;
$sequences$;

CREATE INDEX personal_roles_owner_v1_idx ON public.roles(id_usuario);
CREATE INDEX personal_steps_parent_v1_idx ON public.roles_etapas(id_role);

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.roles'::regclass,
    'public.roles_etapas'::regclass) AND relrowsecurity AND relforcerowsecurity) <> 2
    OR has_table_privilege('anon','public.roles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('anon','public.roles_etapas','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('authenticated','public.roles','TRUNCATE')
    OR has_table_privilege('authenticated','public.roles_etapas','TRUNCATE') THEN
    RAISE EXCEPTION 'Postflight RLS/ACL falhou; conferir inclusive privilegios herdados';
  END IF;
END;
$postflight$;
COMMIT;

-- Nao altera roleService nem dados. DELETE continua fisico e manual, sem cascade novo.
-- Auth anonima sem sessao nao recebe acesso; contas admin nao recebem excecao pessoal.
-- Nao certifica caminhos BYPASSRLS/SECURITY DEFINER ou views de owner: revisar antes
-- da aprovacao. Grants por coluna/heranca devem ser inventariados no catalogo.
-- Atomicidade: o cliente faz UPDATE pai -> DELETE etapas -> INSERT etapas; RLS NAO
-- torna chamadas HTTP atomicas. Falha no INSERT pode deixar etapas removidas;
-- DELETE pode remover etapas e falhar no pai; compensacao de CREATE pode falhar.
-- Proxima mudanca requer RPC transacional (auth.uid, lock do pai, versao esperada,
-- validacao de etapas, alteracoes e retorno na mesma transacao), SEM fallback direto.
-- Nao e instalada nem usada aqui: preservar build/cliente e revisar tipos/contrato.

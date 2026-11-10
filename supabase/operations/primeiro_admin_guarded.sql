-- PROCEDIMENTO DE MANUTENÇÃO PROPOSTO. NÃO EXECUTAR NESTA ETAPA.
-- Sem endpoint/RPC. Não cria contas, perfis, locais ou proprietários.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'Primeiro admin exige autorizacao separada, UUID verificado e ticket de duas pessoas.';
END;
$guard$;
DO $bootstrap$
DECLARE target_user uuid := NULL; operator_ticket text := NULL;
BEGIN
  IF current_user<>'postgres' OR target_user IS NULL OR length(btrim(coalesce(operator_ticket,'')))<10 THEN
    RAISE EXCEPTION 'Executor, UUID explicito e ticket aprovados requeridos.'; END IF;
  PERFORM pg_advisory_xact_lock(7331,20261109);
  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE role='admin') THEN
    RAISE EXCEPTION 'Ja existe administrador; este script nao concede um segundo.'; END IF;
  PERFORM 1 FROM auth.users WHERE id=target_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta Auth inexistente.'; END IF;
  PERFORM 1 FROM public.usuarios WHERE id_usuario=target_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inexistente: revisar trigger original, sem cria-lo aqui.'; END IF;
  INSERT INTO public.user_roles(user_id,role) VALUES(target_user,'admin')
    ON CONFLICT(user_id) DO UPDATE SET role='admin';
  PERFORM 1 FROM public.user_roles WHERE user_id=target_user AND role='admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'Concessao suprimida.'; END IF;
  INSERT INTO public.roleapp_admin_audit(actor,origin,action,subject,reason,details)
    VALUES(NULL,'maintenance','bootstrap_admin',target_user,operator_ticket,
      jsonb_build_object('db_current_user',current_user,'db_session_user',session_user));
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria suprimida: concessao sera revertida.'; END IF;
  PERFORM 1 FROM public.roleapp_admin_audit WHERE origin='maintenance' AND actor IS NULL
    AND action='bootstrap_admin' AND subject=target_user AND reason=operator_ticket;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target_user AND role='admin') THEN
    RAISE EXCEPTION 'Estado final de concessao/auditoria incoerente.'; END IF;
END;
$bootstrap$;
COMMIT;

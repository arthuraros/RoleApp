import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regressão do contrato de hashes entre arquivos; não executa ou simula PostgreSQL/RLS.
const migration = readFileSync(new URL('../supabase/migrations/20261109000200_partner_access_hardening.sql', import.meta.url), 'utf8');
const diagnostic = readFileSync(new URL('../supabase/diagnostics/20261109_constraints_e_view_readonly.sql', import.meta.url), 'utf8');
const expression = (text, start, order) => {
  const from = text.indexOf(`string_agg(${start}`);
  assert.notEqual(from, -1);
  const end = text.indexOf(`ORDER BY ${order}`, from);
  assert.notEqual(end, -1);
  return text.slice(from, end + `ORDER BY ${order}`.length).replace(/\s+/g, '');
};
test('manifesto e diagnóstico serializam políticas com o mesmo cast, separador e ordem', () => {
  const actual = expression(migration, 'p.polname', 'p.polname');
  assert.match(actual, /p\.polcmd::text/);
  assert.equal(actual, expression(diagnostic, 'p.polname', 'p.polname'));
  assert.match(migration, /reviewed_policy_hashes jsonb := NULL/);
});
test('manifesto e diagnóstico serializam triggers com cast explícito e mesmo digest do corpo', () => {
  const actual = expression(migration, 'pg_get_triggerdef', 'g.tgname');
  assert.match(actual, /g\.tgenabled::text/);
  assert.match(actual, /md5\(pg_get_functiondef\(g\.tgfoid\)\)/);
  assert.equal(actual, expression(diagnostic, 'pg_get_triggerdef', 'g.tgname'));
  for (const text of [migration, diagnostic]) assert.match(text, /NOT g\.tgisinternal/);
  assert.match(migration, /reviewed_trigger_hashes jsonb := NULL/);
});

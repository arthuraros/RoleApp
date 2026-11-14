import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Verifica seguranca dos artefatos LOCAIS. Nao executa SQL nem simula RLS.
const root = new URL('../supabase/proposals/20261113_hardening_incremental/', import.meta.url);
const files = fs.readdirSync(root).filter(name => name.endsWith('_blocked.sql')).sort();
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const uncomment = text => text.replace(/--[^\n]*/g, '');

test('hardening: oito etapas isoladas ficam fora do diretorio de migracoes', () => {
  assert.equal(files.length, 8);
  assert.ok(root.pathname.includes('/supabase/proposals/'));
});

for (const file of files) {
  test(`hardening: ${file} nao pode ser implantado como entregue`, () => {
    const sql = uncomment(read(file));
    assert.match(sql, /^\s*BEGIN;/);
    const firstDDL = sql.search(/\b(?:ALTER TABLE|CREATE POLICY|GRANT |REVOKE )/i);
    assert.ok(firstDDL > 0 && sql.indexOf('RAISE EXCEPTION') < firstDDL);
    assert.match(sql, /approved_expected_fingerprint text := NULL;/);
    for (const gate of ['dependency_map_approved', 'rpc_bodies_approved', 'unsafe_alternative_routes_closed',
      'public_projection_approved', 'helper_contracts_approved', 'audit_contract_approved',
      'compatibility_clone_passed', 'reversal_plan_approved']) {
      assert.ok(sql.includes(`${gate} boolean := false;`), gate);
      assert.ok(sql.includes(`NOT ${gate}`), gate);
    }
    assert.match(sql, /to_regprocedure\(helper\) IS NULL/);
    assert.match(sql, /Fonte administrativa com escrita cliente/);
    assert.match(sql, /actual_fingerprint IS DISTINCT FROM approved_expected_fingerprint/);
    assert.match(sql, /\$postflight\$/);
    assert.match(sql, /ROLLBACK;\s*$/);
    assert.doesNotMatch(sql, /\bCOMMIT\s*;/i);
    assert.doesNotMatch(sql, /\bDROP\s+(?:POLICY|TABLE|FUNCTION|SCHEMA)/i);
    assert.doesNotMatch(sql, /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TABLE)/i);
    assert.doesNotMatch(sql, /\bINSERT\s+INTO|\bUPDATE\s+(?:public|auth)\.|\bDELETE\s+FROM|\bTRUNCATE\s+(?:public|auth)\./i);
    assert.doesNotMatch(sql, /WITH CHECK\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(sql, /FORCE ROW LEVEL SECURITY/);
  });
}

test('hardening: fingerprints dos preflights correspondem ao coletor de leitura', () => {
  const diagnostic = fs.readFileSync(new URL('../supabase/diagnostics/20261113_hardening_manifest_readonly.sql', import.meta.url), 'utf8');
  function query(sql) {
    const start = sql.indexOf('WITH relations AS (');
    const end = sql.indexOf('SELECT md5(value::text)', start);
    assert.ok(start >= 0 && end > start);
    return sql.slice(start, end).split('\n').map(line => line.trim()).join('\n').trim();
  }
  for (const file of files) assert.equal(query(read(file)), query(diagnostic), file);
  assert.match(diagnostic, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(diagnostic, /ROLLBACK;\s*$/);
});

test('hardening: propostas preservam toggle e separam mutacoes de campanha/metrica', () => {
  assert.match(uncomment(read('03_locais_edicao_parceiro_blocked.sql')),
    /GRANT UPDATE \(nome,descricao,telefone,faixa_preco,endereco,bairro,cidade_uf,visivel\)/);
  for (const file of ['04_campanhas_blocked.sql', '05_metricas_blocked.sql']) {
    const sql = uncomment(read(file));
    assert.match(sql, /AS RESTRICTIVE FOR INSERT TO anon,authenticated\s+WITH CHECK \(false\)/);
    assert.doesNotMatch(sql, /GRANT\s+(?:INSERT|UPDATE|DELETE)/);
  }
  assert.match(read('04_campanhas_blocked.sql'), /public\.campanhas_impulsionamento/);
});

test('hardening: perfis tem leitura propria e roles legadas exigem classificacao', () => {
  const users = uncomment(read('07_usuarios_leitura_blocked.sql'));
  assert.match(users, /GRANT SELECT \(id_usuario,nome,foto_url\)/);
  assert.match(users, /AS RESTRICTIVE FOR SELECT TO anon,authenticated\s+USING \(id_usuario=auth\.uid\(\)\)/);
  const roles = uncomment(read('08_roles_legadas_blocked.sql'));
  assert.match(roles, /reviewed_legacy_classification IS DISTINCT FROM 'sem_acesso_cliente_legitimo_confirmado'/);
  assert.doesNotMatch(roles, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/);
});

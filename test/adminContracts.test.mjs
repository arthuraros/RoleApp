import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adminService } from '../src/services/adminService.js';
import { supabase } from '../src/services/supabase.js';

// O preload npm test fornece cliente offline; nunca conectar ao Supabase.
function rpcFixture(error = null) {
  const calls = [];
  supabase.rpc = async (name, args) => { calls.push({ name, args }); return { data: { fixture: true }, error }; };
  supabase.from = () => { throw Error('Escrita direta proibida neste teste'); };
  return calls;
}

test('RA-11: fluxo comercial bloqueia aprovação insegura e preserva reprovação sem papel/ator', async () => {
  const calls = rpcFixture();
  await adminService.encaminharParaDecisao(5, ' Observação verificada ');
  await assert.rejects(
    adminService.decidirParceria({ idSolicitacao: 5, decisao: 'aprovado', justificativa: ' Justificativa verificada ',
      idLocal: 8, identidadeConfirmada: true, duplicidadeRevisada: true, actor: 'forjado', role: 'admin' }),
    { code: 'ADMIN_APPROVAL_CONTRACT_BLOCKED' },
  );
  await adminService.decidirParceria({ idSolicitacao: 5, decisao: 'rejeitado', justificativa: ' Justificativa verificada ',
    actor: 'forjado', role: 'admin' });
  await adminService.obterDetalhesDecisao(5);
  assert.deepEqual(calls, [
    { name: 'encaminhar_solicitacao_decisao', args: { p_id_solicitacao: 5, p_observacao: 'Observação verificada' } },
    { name: 'decidir_solicitacao_comercial', args: { p_id_solicitacao: 5, p_decisao: 'rejeitado',
      p_justificativa: 'Justificativa verificada', p_id_local: null, p_identidade_confirmada: false, p_duplicidade_revisada: false } },
    { name: 'obter_detalhe_decisao_admin', args: { p_id_solicitacao: 5 } },
  ]);
});

test('RA-11: falha das RPCs comerciais não tenta escrita direta ou endpoint alternativo', async () => {
  const calls = rpcFixture({ message: 'Negado pela fixture' });
  await assert.rejects(adminService.encaminharParaDecisao(5, 'Observação verificada'), /Negado/);
  await assert.rejects(adminService.decidirParceria({ idSolicitacao: 5, decisao: 'aprovado', justificativa: 'Justificativa verificada',
    idLocal: 8, identidadeConfirmada: true, duplicidadeRevisada: true }), { code: 'ADMIN_APPROVAL_CONTRACT_BLOCKED' });
  await assert.rejects(adminService.decidirParceria({ idSolicitacao: 5, decisao: 'rejeitado', justificativa: 'Justificativa verificada' }), /Negado/);
  await assert.rejects(adminService.obterDetalhesDecisao(5), /Negado/);
  assert.equal(calls.length, 3);
});

test('RA-11: proposta SQL fica bloqueada, sem RPC operacional ou concessão ao cliente', () => {
  const sql = fs.readFileSync(new URL('../supabase/proposals/20261113_ra11_admin_contracts_blocked.sql', import.meta.url), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '');
  assert.match(statements, /^\s*BEGIN;/);
  assert.ok(statements.indexOf('RAISE EXCEPTION') < statements.indexOf('CREATE TABLE'));
  assert.match(statements, /reviewed_catalog jsonb := NULL/);
  assert.match(statements, /reviewed_recovery_and_last_admin_lock boolean := false/);
  assert.match(statements, /REVOKE ALL ON TABLE/);
  assert.doesNotMatch(statements, /\b(GRANT|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|INSERT\s+INTO|DELETE\s+FROM|DROP)\b/i);
  assert.doesNotMatch(statements, /ON DELETE CASCADE/i);
  assert.match(statements, /ROLLBACK;\s*$/);
});

test('RA-11: diagnóstico SQL só lê catálogo e não executa contratos comerciais', () => {
  const sql = fs.readFileSync(new URL('../supabase/diagnostics/20261113_ra11_admin_contracts_readonly.sql', import.meta.url), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '');
  assert.match(statements, /^\s*BEGIN TRANSACTION READ ONLY;/);
  assert.doesNotMatch(statements, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO)\b/i);
  assert.match(statements, /ROLLBACK;\s*$/);
  for (const name of ['encaminhar_solicitacao_decisao', 'decidir_solicitacao_comercial', 'obter_detalhe_decisao_admin']) {
    assert.ok(sql.includes(`('${name}')`));
    assert.ok(!new RegExp(`SELECT\\s+(?:public\\.)?${name}\\s*\\(`, 'i').test(statements));
  }
});

test('diagnóstico de dependências pendentes é somente leitura e retorna corpos e ACLs', () => {
  const sql = fs.readFileSync(new URL('../supabase/diagnostics/20261114_admin_pending_dependencies_readonly.sql', import.meta.url), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");
  assert.match(statements, /^\s*BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(statements, /pg_get_functiondef\(p\.oid\)/);
  assert.match(statements, /aclexplode/);
  assert.match(statements, /has_function_privilege/);
  assert.match(statements, /ROLLBACK;\s*$/);
  assert.doesNotMatch(statements, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|EXECUTE)\b/i);
  for (const [schema, name] of [
    ['public', 'revisar_parceria_segura'], ['public', 'solicitar_campanha_segura'],
    ['public', 'listar_ofertas_campanha'], ['public', 'ativar_campanha_segura'],
    ['roleapp_security', 'admin_has_capability'], ['roleapp_security', 'admin_actor_id'],
  ]) {
    assert.ok(sql.includes(`('${schema}', '${name}')`));
  }
});

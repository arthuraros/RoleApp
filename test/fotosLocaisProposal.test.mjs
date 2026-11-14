import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Verifica contratos dos ARQUIVOS, sem interpretar/executar SQL ou simular RLS.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const proposal = read('supabase/proposals/20261109_fotos_locais_storage_blocked.sql');
const diagnostic = read('supabase/diagnostics/20261109_fotos_locais_storage_readonly.sql');

test('coleta e preflight usam exatamente o mesmo manifesto de catalogo', () => {
  const from = 'WITH targets(name)';
  const manifest = diagnostic.slice(diagnostic.indexOf(from), diagnostic.indexOf('-- END REVIEW MANIFEST'))
    .trim().replace(') AS review_manifest', ') INTO actual_manifest');
  assert.ok(proposal.includes(manifest + ';'));
  assert.match(manifest, /p\.polcmd::text/);
  assert.match(manifest, /g\.tgenabled::text/);
});

test('proposta continua com trava incondicional e parametros nao preenchidos', () => {
  const guard = proposal.slice(proposal.indexOf('DO $guard$'), proposal.indexOf('$guard$;') + 8);
  assert.match(guard, /BEGIN\s+RAISE EXCEPTION/);
  assert.doesNotMatch(guard, /\bIF\b/);
  assert.ok(proposal.indexOf(guard) < proposal.indexOf('LOCK TABLE'));
  assert.match(proposal, /reviewed_manifest jsonb := NULL/);
  assert.match(proposal, /reviewed_public_url_prefix text := NULL/);
  assert.match(proposal, /reviewed_path_url_and_public_asset_contract boolean := false/);
  assert.doesNotMatch(proposal, /ALTER\s+TABLE\s+storage\.buckets|(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+storage\.buckets/i);
});

test('diagnostico delimita READ ONLY/ROLLBACK e nao chama helpers de negocio', () => {
  const sql = diagnostic.replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");
  assert.match(sql, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\s/i);
  assert.doesNotMatch(sql, /(?:SELECT|PERFORM)\s+roleapp_security\./i);
  assert.doesNotMatch(sql, /aclexplode\s*\(\s*coalesce\([^\n]*ARRAY\[\]/i);
});

test('loops e grant options mantem separadores e papeis sao resolvidos por OID', () => {
  assert.doesNotMatch(proposal, /::regclassLOOP|WITHGRANT OPTION/);
  assert.match(proposal, /::regclass\s+LOOP/);
  assert.match(proposal, /SELECT r\.oid INTO actor_oid FROM pg_roles r WHERE r\.rolname=actor/);
  assert.doesNotMatch(proposal, /(?:has_\w+_privilege|pg_has_role)\(actor,/);
  assert.match(proposal, /has_sequence_privilege\(actor_oid,seq::oid,'USAGE WITH GRANT OPTION'\)/);
});

test('prefixo e regex nao confirmados permanecem vazios e RETURNING exige revisao', () => {
  assert.match(proposal, /reviewed_path_pattern text := NULL/);
  assert.match(proposal, /reviewed_public_url_prefix text := NULL/);
  assert.match(proposal, /reviewed_projection_and_returning_contract boolean := false/);
  assert.match(proposal, /reviewed_storage_trigger_and_bucket_immutability boolean := false/);
  assert.doesNotMatch(proposal, /jpg\|jpeg\|png\|webp|\/storage\/v1\/object\/public\/imagens-locais/);
  assert.match(proposal, /GRANT SELECT\(id_foto,id_local,url_foto\)/);
  assert.match(proposal, /GRANT INSERT\(id_local,url_foto\),UPDATE\(url_foto\)/);
  assert.match(proposal, /GRANT DELETE ON public\.fotos_locais TO authenticated/);
});

test('janela de locks e limitada e permanece depois da trava incondicional', () => {
  const endGuard = proposal.indexOf('$guard$;');
  for (const setting of ['lock_timeout', 'statement_timeout', 'idle_in_transaction_session_timeout']) {
    assert.ok(proposal.indexOf(`SET LOCAL ${setting}`) > endGuard);
  }
  assert.match(proposal, /LOCK TABLE public\.fotos_locais,storage\.objects IN ACCESS EXCLUSIVE MODE NOWAIT/);
});

test('composicao OR/AND admite contraexemplo; invariante proposta precisa comparar OLD e NEW', () => {
  // Modelo logico de um UPDATE autorizado em cada lado por permissivas DIFERENTES.
  // Nao e um simulador de PostgreSQL, RLS, JWT ou API Storage.
  const oldPermissives = [true, false]; // imagens-locais
  const newPermissives = [false, true]; // avatars
  const oldRestrictives = [true, true];
  const newRestrictives = [true, true];
  assert.ok(oldPermissives.some(Boolean) && newPermissives.some(Boolean)
    && oldRestrictives.every(Boolean) && newRestrictives.every(Boolean));
  const protectedBuckets = new Set(['imagens-locais', 'avatars']);
  const reject = (oldBucket, newBucket) => oldBucket !== newBucket
    && (protectedBuckets.has(oldBucket) || protectedBuckets.has(newBucket));
  assert.equal(reject('imagens-locais', 'avatars'), true);
  for (const bucket of ['imagens-locais', 'avatars']) {
    for (const other of ['imagens-locais', 'avatars', 'other-fixture', null]) {
      assert.equal(reject(bucket, other), bucket !== other);
      assert.equal(reject(other, bucket), bucket !== other);
    }
  }
  assert.equal(reject('other-fixture', 'another-fixture'), false);
  assert.match(proposal, /OLD\.bucket_id IS DISTINCT FROM NEW\.bucket_id/);
  assert.match(proposal, /OLD\.bucket_id IN \('imagens-locais','avatars'\) OR NEW\.bucket_id IN \('imagens-locais','avatars'\)/);
});

test('trigger imediato nao depende do ator, API ou lista de colunas do UPDATE', () => {
  const start = proposal.indexOf('CREATE FUNCTION roleapp_security.protect_image_bucket_identity()');
  const end = proposal.indexOf('$bucket_function$;', start);
  const functionSql = proposal.slice(start, end);
  assert.match(functionSql, /SECURITY INVOKER SET search_path=''/);
  assert.doesNotMatch(functionSql, /auth\.uid|current_user|is_admin|SECURITY DEFINER/);
  assert.match(proposal, /CREATE TRIGGER roleapp_images_bucket_identity AFTER UPDATE ON storage\.objects/);
  assert.doesNotMatch(proposal, /CREATE TRIGGER roleapp_images_bucket_identity AFTER UPDATE OF/);
  assert.match(proposal, /ENABLE ALWAYS TRIGGER roleapp_images_bucket_identity/);
  assert.match(proposal, /REVOKE ALL ON FUNCTION roleapp_security\.protect_image_bucket_identity\(\) FROM PUBLIC,anon,authenticated/);
});

test('formatos SQL dinamicos possuem placeholders validos e argumentos suficientes', () => {
  // Tokenizacao limitada a chamadas format com primeiro argumento literal; nao e parser SQL.
  const quoted = (start) => {
    let value = '';
    for (let i = start + 1; i < proposal.length; i++) {
      if (proposal[i] !== "'") { value += proposal[i]; continue; }
      if (proposal[i + 1] === "'") { value += "'"; i++; continue; }
      return { value, end: i + 1 };
    }
    assert.fail('literal SQL incompleto');
  };
  let calls = 0;
  for (const match of proposal.matchAll(/\bformat\s*\(\s*'/g)) {
    const literal = quoted(match.index + match[0].length - 1);
    let depth = 1; let commas = 0;
    for (let i = literal.end; i < proposal.length; i++) {
      if (proposal[i] === "'") { i = quoted(i).end - 1; continue; }
      if (proposal[i] === '(') depth++;
      if (proposal[i] === ')') { if (--depth === 0) break; }
      if (proposal[i] === ',' && depth === 1) commas++;
    }
    assert.equal(depth, 0, 'chamada format incompleta');
    let nextArgument = 1;
    for (const placeholder of literal.value.matchAll(/%(?:(\d+)\$)?([sIL%])/g)) {
      if (placeholder[2] === '%') continue;
      const position = placeholder[1] ? Number(placeholder[1]) : nextArgument;
      assert.ok(position <= commas, `argumento ausente em ${literal.value}`);
      nextArgument = position + 1;
    }
    assert.doesNotMatch(literal.value.replace(/%(?:\d+\$)?[sIL%]/g, ''), /%/);
    calls++;
  }
  assert.ok(calls >= 20, 'cobertura das chamadas SQL dinamicas');
});

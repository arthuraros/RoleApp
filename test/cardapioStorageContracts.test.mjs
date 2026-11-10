import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';
import { supabase } from '../src/services/supabase.js';
import { cardapioService } from '../src/services/cardapioService.js';

// Executa a função REAL de upload extraída por AST, sem carregar o runtime nativo Expo.
// Todos os serviços/arquivos são simulados; isto não testa Storage ou RLS reais.
const source = readFileSync(new URL('../src/services/userService.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module' });
const declaration = ast.program.body.find(node => node.declaration?.id?.name === 'uploadUserAvatar').declaration;
function avatarFixture() {
  const calls = [];
  const client = {
    storage: { from(bucket) { return {
      async upload(path, data, options) { calls.push({ bucket, path, options }); return { error: null }; },
      getPublicUrl(path) { return { data: { publicUrl: `https://example.invalid/${bucket}/${path}` } }; },
    }; } },
    from(table) { return { update(fields) { return { async eq(column, id) {
      calls.push({ table, fields, column, id }); return { error: null };
    } }; } }; },
  };
  const upload = runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, {
    supabase: client, decode: () => new ArrayBuffer(1),
    FileSystem: { EncodingType: { Base64: 'base64' }, readAsStringAsync: async () => 'AA==' },
  });
  return { upload, calls };
}
for (const [uri, extension] of [['file:///photo.png', 'png'], ['file:///photo.JPG', 'jpg'], ['file:///photo.heic', 'heic']]) {
  test(`avatar mantém caminho comprovado e upsert, sem inventar extensão: ${extension}`, async () => {
    const { upload, calls } = avatarFixture();
    const id = 'f0911000-0000-4000-8000-000000000001';
    await upload(id, uri);
    assert.equal(calls[0].bucket, 'avatars');
    assert.equal(calls[0].path, `${id}/avatar.${extension}`);
    assert.equal(calls[0].options.upsert, true);
    assert.equal(calls[1].table, 'usuarios');
    assert.equal(calls[1].id, id);
  });
}
test('avatar sem usuário não tenta upload', async () => {
  const { upload, calls } = avatarFixture();
  await assert.rejects(upload(null, 'file:///photo.png'), /usuário/);
  assert.equal(calls.length, 0);
});

function menuClient() {
  const calls = [];
  const single = fields => ({ select: () => ({ single: async () => ({ data: fields, error: null }) }) });
  supabase.from = table => ({
    insert(fields) { calls.push({ table, action: 'insert', fields }); return single(fields); },
    update(fields) { return { eq(column, id) {
      calls.push({ table, action: 'update', fields, column, id }); return single(fields);
    } }; },
    delete() { return { eq(column, id) { return { async select() {
      calls.push({ table, action: 'delete', column, id }); return { data: [{ id_item: id }], error: null };
    } }; } }; },
  });
  return calls;
}
test('categoria conserva INSERT seguido de SELECT/RETURNING', async () => {
  const calls = menuClient();
  await cardapioService.criarCategoria({ idLocal: 10, nome: ' Bebidas ' });
  assert.deepEqual(calls, [{ table: 'categorias_cardapio', action: 'insert', fields: { id_local: 10, nome: 'Bebidas', ativo: true } }]);
});
test('item conserva categoria, preço e campos de criação existentes', async () => {
  const calls = menuClient();
  await cardapioService.criarItem({ idLocal: 10, idCategoria: 20, nome: ' Água ', descricao: '', preco: '3,50' });
  assert.equal(calls[0].fields.id_local, 10);
  assert.equal(calls[0].fields.id_categoria, 20);
  assert.equal(calls[0].fields.preco, 3.5);
});
test('edição de item continua sem transmitir mudança de local', async () => {
  const calls = menuClient();
  await cardapioService.atualizarItem(30, { nome: ' Água ', preco: '4,50', id_local: 999 });
  assert.deepEqual(calls[0].fields, { nome: 'Água', preco: 4.5 });
});
test('exclusão de item preserva retorno do ID e confirmação de efeito', async () => {
  const calls = menuClient();
  assert.equal(await cardapioService.excluirItem(30), true);
  assert.equal(calls[0].action, 'delete');
  assert.equal(calls[0].column, 'id_item');
});

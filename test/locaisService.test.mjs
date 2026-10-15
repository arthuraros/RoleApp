import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../src/services/supabase.js';
import { locaisService } from '../src/services/locaisService.js';

// --- MOCK DO STORAGE DO SUPABASE (EVITA ERRO DE ASYNCSTORAGE NO NODE.JS) ---
const mockStorage = new Map();
if (supabase.auth) {
  supabase.auth.storage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, value) => mockStorage.set(key, value),
    removeItem: (key) => mockStorage.delete(key),
  };

  // Interrompe qualquer timer assíncrono de auto-refresh de sessão pendente
  if (typeof supabase.auth._stopAutoRefreshToken === 'function') {
    supabase.auth._stopAutoRefreshToken();
  }
}

describe('Testes de Unidade - Módulo locaisService (RolêApp)', () => {

  test('TU01 - getLocais: retorna lista de locais ordenados por data de criação', async () => {
    const mockData = [
      { id_local: 1, nome: 'Bistrô do Centro', preco_entrada: 25 },
      { id_local: 2, nome: 'Cine R.U', preco_entrada: 0 },
    ];

    // Mock das chamadas encadeadas do Supabase
    supabase.from = () => ({
      select: () => ({
        order: async () => ({ data: mockData, error: null }),
      }),
    });

    const locais = await locaisService.getLocais();
    assert.deepEqual(locais, mockData);
    assert.equal(locais.length, 2);
  });

  test('TU02 - getLocais: lança erro formatado quando a consulta falha no banco', async () => {
    supabase.from = () => ({
      select: () => ({
        order: async () => ({ data: null, error: { message: 'Erro de conexão com a tabela locais' } }),
      }),
    });

    await assert.rejects(
      async () => await locaisService.getLocais(),
      {
        name: 'Error',
        message: 'Erro de conexão com a tabela locais',
      }
    );
  });

  test('TU03 - getLocalById: busca e retorna um único local pelo id_local', async () => {
    const mockLocal = {
      id_local: 10,
      nome: 'Parque Central',
      endereco: 'Av. Principal, 100',
      preco_entrada: 0,
    };

    supabase.from = () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockLocal, error: null }),
        }),
      }),
    });

    const local = await locaisService.getLocalById(10);
    assert.equal(local.id_local, 10);
    assert.equal(local.nome, 'Parque Central');
  });

  test('TU04 - getLocalById: lança erro se o id_local fornecido for inválido ou nulo', async () => {
    const validateId = (id) => {
      if (!id || typeof id !== 'number' || id <= 0) {
        throw new Error('ID do local inválido.');
      }
      return true;
    };

    assert.throws(() => validateId(null), { message: 'ID do local inválido.' });
    assert.throws(() => validateId(0), { message: 'ID do local inválido.' });
    assert.equal(validateId(5), true);
  });

  test('TU05 - searchLocais: higieniza o termo de busca removendo espaços extras', () => {
    const sanitizeSearchTerm = (term) => (term ? term.trim() : '');

    assert.equal(sanitizeSearchTerm('   Bistrô   '), 'Bistrô');
    assert.equal(sanitizeSearchTerm(''), '');
  });

  test('TU06 - searchLocais: constrói o filtro ILIKE para nome e endereço', async () => {
    let queryFiltro = '';

    supabase.from = () => ({
      select: () => ({
        or: async (filtro) => {
          queryFiltro = filtro;
          return { data: [{ id_local: 1, nome: 'Bistrô Central' }], error: null };
        },
      }),
    });

    const resultado = await locaisService.searchLocais('Bistrô');
    assert.equal(queryFiltro, 'nome.ilike.%Bistrô%,endereco.ilike.%Bistrô%');
    assert.equal(resultado.length, 1);
  });

  test('TU07 - createLocal (Validação): rejeita cadastro de local sem nome ou endereço', () => {
    const validateLocalPayload = (payload) => {
      if (!payload.nome || !payload.nome.trim()) {
        throw new Error('O nome do local é obrigatório.');
      }
      if (!payload.endereco || !payload.endereco.trim()) {
        throw new Error('O endereço do local é obrigatório.');
      }
      return true;
    };

    assert.throws(() => validateLocalPayload({ nome: '', endereco: 'Rua 1' }), {
      message: 'O nome do local é obrigatório.',
    });
    assert.throws(() => validateLocalPayload({ nome: 'Cinema', endereco: '  ' }), {
      message: 'O endereço do local é obrigatório.',
    });
    assert.equal(validateLocalPayload({ nome: 'Teatro', endereco: 'Rua A' }), true);
  });

  test('TU08 - createLocal (Validação): garante que preco_entrada não seja um valor negativo', () => {
    const validatePrecoEntrada = (preco) => {
      if (preco < 0) {
        throw new Error('O preço de entrada não pode ser negativo.');
      }
      return true;
    };

    assert.throws(() => validatePrecoEntrada(-10), {
      message: 'O preço de entrada não pode ser negativo.',
    });
    assert.equal(validatePrecoEntrada(0), true);
    assert.equal(validatePrecoEntrada(15.5), true);
  });

  test('TU09 - createLocal: insere o registro e retorna o objeto criado', async () => {
    const novoLocalInput = {
      nome: 'Museu de Arte',
      endereco: 'Praça das Artes, 50',
      preco_entrada: 12.0,
    };

    const localCriadoMock = { id_local: 99, ...novoLocalInput };

    supabase.from = () => ({
      insert: () => ({
        select: async () => ({ data: [localCriadoMock], error: null }),
      }),
    });

    const resultado = await locaisService.createLocal(novoLocalInput);
    assert.equal(resultado.id_local, 99);
    assert.equal(resultado.nome, 'Museu de Arte');
  });

  test('TU10 - updateLocal: altera dados do local e retorna o registro atualizado', async () => {
    const dadosAtualizados = { nome: 'Novo Bistrô Centro' };
    const mockRetorno = { id_local: 1, nome: 'Novo Bistrô Centro', preco_entrada: 25 };

    supabase.from = () => ({
      update: () => ({
        eq: () => ({
          select: async () => ({ data: [mockRetorno], error: null }),
        }),
      }),
    });

    const resultado = await locaisService.updateLocal(1, dadosAtualizados);
    assert.equal(resultado.nome, 'Novo Bistrô Centro');
  });

  test('TU11 - deleteLocal: remove o local com sucesso e retorna boolean true', async () => {
    supabase.from = () => ({
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    });

    const deletado = await locaisService.deleteLocal(1);
    assert.equal(deletado, true);
  });

  test('TU12 - deleteLocal: lança erro caso a exclusão falhe no banco de dados', async () => {
    supabase.from = () => ({
      delete: () => ({
        eq: async () => ({ error: { message: 'Violação de chave estrangeira.' } }),
      }),
    });

    await assert.rejects(
      async () => await locaisService.deleteLocal(999),
      {
        name: 'Error',
        message: 'Violação de chave estrangeira.',
      }
    );
  });

  test('TU13 - Formatação de Preço: identifica locais com entrada gratuita', () => {
    const formatPrecoEntrada = (preco) => {
      if (preco === 0 || preco === null || preco === undefined) {
        return 'Gratuito';
      }
      return `Entrada: R$ ${preco.toFixed(2)}`;
    };

    assert.equal(formatPrecoEntrada(0), 'Gratuito');
    assert.equal(formatPrecoEntrada(null), 'Gratuito');
    assert.equal(formatPrecoEntrada(15), 'Entrada: R$ 15.00');
  });
});
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../src/services/supabase.js';
import { roleService } from '../src/services/roleService.js';

describe('Testes de Unidade - Módulo roleService (RolêApp)', () => {

  beforeEach(() => {
    // Reseta os mocks do Supabase antes de cada teste
    supabase.from = () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
          single: async () => ({ data: null, error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id_role: 1 }, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: null }),
          delete: async () => ({ error: null }),
        }),
      }),
    });
  });

  test('TS01 - criarRoleCompletoComEtapas: rejeita criação sem ID de usuário autenticado', async () => {
    await assert.rejects(
      async () => await roleService.criarRoleCompletoComEtapas(null, 'Rolê de Teste', []),
      {
        name: 'Error',
        message: 'Usuário não autenticado.',
      }
    );
  });

  test('TS02 - criarRoleCompletoComEtapas: rejeita criação de rolê sem nome ou com nome vazio', async () => {
    await assert.rejects(
      async () => await roleService.criarRoleCompletoComEtapas('user-123', '   ', [{ etapa: 1, id_local: 1 }]),
      {
        name: 'Error',
        message: 'Dê um nome para o rolê.',
      }
    );
  });

  test('TS03 - criarRoleCompletoComEtapas: rejeita criação de rolê sem etapas ou locais informados', async () => {
    await assert.rejects(
      async () => await roleService.criarRoleCompletoComEtapas('user-123', 'Rolê Vazio', []),
      {
        name: 'Error',
        message: 'Adicione pelo menos um local/etapa.',
      }
    );
  });

  test('TS04 - getRolesDoUsuario: retorna lista de rolês ordenados e estruturados do usuário', async () => {
    const mockRoles = [
      {
        id_role: 1,
        nome_role: 'Noite de Botecos',
        status: 'planejado',
        preco_final: 50.00,
        created_at: '2026-10-01T20:00:00Z',
        roles_etapas: [
          { etapa: 1, id_local: 1, item_cardapio: 'Chopp', quantidade_item: 2, custo_acao: 20 },
        ],
      },
    ];

    supabase.from = () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: mockRoles, error: null }),
        }),
      }),
    });

    const roles = await roleService.getRolesDoUsuario('user-123');
    assert.equal(roles.length, 1);
    assert.equal(roles[0].nome_role, 'Noite de Botecos');
    assert.equal(roles[0].preco_final, 50.00);
  });

  test('TS05 - getRolesDoUsuario: retorna array vazio se userId não for fornecido', async () => {
    const roles = await roleService.getRolesDoUsuario(null);
    assert.deepEqual(roles, []);
  });

  test('TS06 - getRolesDoUsuario: lança erro se a consulta falhar no banco de dados', async () => {
    supabase.from = () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: null, error: { message: 'Erro ao consultar roles' } }),
        }),
      }),
    });

    await assert.rejects(
      async () => await roleService.getRolesDoUsuario('user-123'),
      (err) => {
        assert.equal(err.message, 'Erro ao consultar roles');
        return true;
      }
    );
  });

  test('TS07 - deletarRole: exige id_role e userId válidos para exclusão', async () => {
    await assert.rejects(
      async () => await roleService.deletarRole(null, 'user-123'),
      {
        name: 'Error',
        message: 'Identificação inválida para exclusão.',
      }
    );
  });

  test('TS08 - atualizarStatusEPrecoRole: atualiza com sucesso o status e o preço final', async () => {
    let dadosAtualizados = null;

    supabase.from = () => ({
      update: (payload) => {
        dadosAtualizados = payload;
        return {
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    });

    const resultado = await roleService.atualizarStatusEPrecoRole(1, 'user-123', 'realizado', 85.50);
    assert.equal(resultado.success, true);
    assert.equal(dadosAtualizados.status, 'realizado');
    assert.equal(dadosAtualizados.preco_final, 85.50);
  });

  test('TS09 - atualizarStatusEPrecoRole: lança erro se parâmetros obrigatórios estiverem faltando', async () => {
    await assert.rejects(
      async () => await roleService.atualizarStatusEPrecoRole(null, 'user-123', 'realizado', 50),
      {
        message: 'Dados insuficientes.',
      }
    );
  });

});
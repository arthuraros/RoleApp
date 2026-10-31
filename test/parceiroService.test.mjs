import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../src/services/supabase.js';
import { parceiroService } from '../src/services/parceiroService.js';

// --- MOCK DO STORAGE DO SUPABASE (EVITA ERRO DE ASYNCSTORAGE NO AMBIENTE NODE.JS) ---
const mockStorage = new Map();
if (supabase.auth) {
  supabase.auth.storage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, value) => mockStorage.set(key, value),
    removeItem: (key) => mockStorage.delete(key),
  };

  if (typeof supabase.auth._stopAutoRefreshToken === 'function') {
    supabase.auth._stopAutoRefreshToken();
  }
}

describe('Testes de Unidade - Módulo parceiroService (RolêApp)', () => {

  // ==========================================
  // 1. SOLICITAÇÕES DE PARCERIA
  // ==========================================
  test('TU01 - enviarSolicitacaoParceria: grava solicitação com status pendente', async () => {
    const payload = {
      idUsuario: 'user-uuid-123',
      nome: 'João Silva',
      email: 'joao@email.com',
      estabelecimento: 'Bar do João',
      cidadeEstado: 'Brasília, DF',
    };

    let insertedData = null;
    supabase.from = (table) => {
      assert.equal(table, 'solicitacoes_parceria');
      return {
        insert: (data) => {
          insertedData = data[0];
          return {
            select: () => ({
              single: async () => ({
                data: { id_solicitacao: 1, ...insertedData },
                error: null,
              }),
            }),
          };
        },
      };
    };

    const resultado = await parceiroService.enviarSolicitacaoParceria(payload);
    assert.equal(resultado.id_solicitacao, 1);
    assert.equal(resultado.status, 'pendente');
    assert.equal(resultado.estabelecimento, 'Bar do João');
    assert.equal(insertedData.id_usuario, 'user-uuid-123');
  });

  test('TU02 - enviarSolicitacaoParceria: propaga erro formatado quando insert falha', async () => {
    supabase.from = () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: null,
            error: { message: 'Erro de validação ou restrição' },
          }),
        }),
      }),
    });

    await assert.rejects(
      async () => await parceiroService.enviarSolicitacaoParceria({
        nome: 'A', email: 'b@b.com', estabelecimento: 'C', cidadeEstado: 'DF'
      }),
      {
        name: 'Error',
        message: 'Erro de validação ou restrição',
      }
    );
  });

  // ==========================================
  // 2. LOCAIS DO PARCEIRO
  // ==========================================
  test('TU03 - getLocaisDoParceiro: executa fallback para listar locais quando idUsuario não é informado', async () => {
    const mockLocaisGerais = [
      { id_local: 1, nome: 'Café do Cerrado' },
      { id_local: 2, nome: 'Parque das Águas' },
    ];

    supabase.from = (table) => {
      assert.equal(table, 'locais');
      return {
        select: () => ({
          order: () => ({
            limit: async () => ({ data: mockLocaisGerais, error: null }),
          }),
        }),
      };
    };

    const resultado = await parceiroService.getLocaisDoParceiro(null);
    assert.deepEqual(resultado, mockLocaisGerais);
    assert.equal(resultado.length, 2);
  });

  test('TU04 - getLocaisDoParceiro: busca locais filtrando por id_proprietario', async () => {
    const mockLocaisParceiro = [
      { id_local: 10, nome: 'Bistrô do Centro', id_proprietario: 'user-100' },
    ];

    let filtroProprietario = null;
    supabase.from = (table) => {
      assert.equal(table, 'locais');
      return {
        select: () => ({
          eq: (col, val) => {
            filtroProprietario = { col, val };
            return {
              order: async () => ({ data: mockLocaisParceiro, error: null }),
            };
          },
        }),
      };
    };

    const resultado = await parceiroService.getLocaisDoParceiro('user-100');
    assert.deepEqual(filtroProprietario, { col: 'id_proprietario', val: 'user-100' });
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].nome, 'Bistrô do Centro');
  });

  test('TU05 - getLocaisDoParceiro: ativa fallback de amostra quando parceiro ainda não possui locais', async () => {
    const mockAmostra = [{ id_local: 1, nome: 'Local Modelo' }];

    let chamada = 0;
    supabase.from = () => ({
      select: () => {
        chamada++;
        if (chamada === 1) {
          // Primeira chamada: busca por proprietário retorna vazio
          return {
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          };
        }
        // Segunda chamada: fallback para primeiros locais
        return {
          order: () => ({
            limit: async () => ({ data: mockAmostra, error: null }),
          }),
        };
      },
    });

    const resultado = await parceiroService.getLocaisDoParceiro('novo-usuario');
    assert.deepEqual(resultado, mockAmostra);
  });

  // ==========================================
  // 3. DETALHES COMPLETOS DO LOCAL
  // ==========================================
  test('TU06 - getLocalComDetalhes: retorna null imediatamente se idLocal não for informado', async () => {
    const resultado = await parceiroService.getLocalComDetalhes(null);
    assert.equal(resultado, null);
  });

  test('TU07 - getLocalComDetalhes: agrega dados do local, horários e eventos em paralelo', async () => {
    const mockLocal = { id_local: 5, nome: 'Pizzaria Noturna', visivel: true };
    const mockHorarios = [{ dia_semana: 1, abre: '18:00', fecha: '23:00', fechado: false }];
    const mockEventos = [{ id_evento: 1, titulo: 'Rodízio Especial', dias: 'Seg', hora: '19:00' }];

    supabase.from = (table) => {
      if (table === 'locais') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: mockLocal, error: null }),
            }),
          }),
        };
      }
      if (table === 'horarios_funcionamento') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: mockHorarios, error: null }),
            }),
          }),
        };
      }
      if (table === 'eventos_locais') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: mockEventos, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Tabela inesperada: ${table}`);
    };

    const resultado = await parceiroService.getLocalComDetalhes(5);
    assert.equal(resultado.id_local, 5);
    assert.deepEqual(resultado.horarios, mockHorarios);
    assert.deepEqual(resultado.eventos, mockEventos);
  });

  // ==========================================
  // 4. ATUALIZAÇÃO DO LOCAL (EDIÇÃO E RLS)
  // ==========================================
  test('TU08 - updateLocal: atualiza atributos do local e retorna o primeiro item', async () => {
    const payloadUpdate = { nome: 'Bistrô Atualizado', visivel: false };
    const mockRetornado = { id_local: 20, ...payloadUpdate };

    supabase.from = (table) => {
      assert.equal(table, 'locais');
      return {
        update: (dados) => {
          assert.deepEqual(dados, payloadUpdate);
          return {
            eq: (col, val) => {
              assert.equal(col, 'id_local');
              assert.equal(val, 20);
              return {
                select: async () => ({ data: [mockRetornado], error: null }),
              };
            },
          };
        },
      };
    };

    const atualizado = await parceiroService.updateLocal(20, payloadUpdate);
    assert.equal(atualizado.id_local, 20);
    assert.equal(atualizado.nome, 'Bistrô Atualizado');
    assert.equal(atualizado.visivel, false);
  });

  test('TU09 - updateLocal: lança erro claro se 0 registros forem alterados (bloqueio RLS)', async () => {
    supabase.from = () => ({
      update: () => ({
        eq: () => ({
          select: async () => ({ data: [], error: null }),
        }),
      }),
    });

    await assert.rejects(
      async () => await parceiroService.updateLocal(999, { nome: 'Teste' }),
      (err) => {
        assert.match(err.message, /Nenhum registro foi atualizado/);
        return true;
      }
    );
  });

  // ==========================================
  // 5. HORÁRIOS DE FUNCIONAMENTO
  // ==========================================
  test('TU10 - salvarHorarios: ignora sem chamar banco se lista ou idLocal estiverem vazios', async () => {
    let bancoAcessado = false;
    supabase.from = () => {
      bancoAcessado = true;
      return {};
    };

    await parceiroService.salvarHorarios(null, [{ active: true }]);
    await parceiroService.salvarHorarios(1, []);
    assert.equal(bancoAcessado, false);
  });

  test('TU11 - salvarHorarios: deleta registros anteriores e insere novos horários mapeados', async () => {
    let deletadoLocal = null;
    let inseridos = null;

    supabase.from = (table) => {
      assert.equal(table, 'horarios_funcionamento');
      return {
        delete: () => ({
          eq: async (col, val) => {
            deletadoLocal = { col, val };
            return { error: null };
          },
        }),
        insert: (rows) => {
          inseridos = rows;
          return {
            select: async () => ({ data: rows, error: null }),
          };
        },
      };
    };

    const listaHorarios = [
      { day: 'Seg', open: '08:00', close: '18:00', active: true, dia_semana: 1 },
      { day: 'Dom', open: '', close: '', active: false, dia_semana: 0 },
    ];

    const res = await parceiroService.salvarHorarios(15, listaHorarios);
    assert.deepEqual(deletadoLocal, { col: 'id_local', val: 15 });
    assert.equal(inseridos.length, 2);
    assert.equal(inseridos[0].abre, '08:00');
    assert.equal(inseridos[0].fechado, false);
    assert.equal(inseridos[1].fechado, true);
    assert.equal(inseridos[1].abre, null);
    assert.equal(res.length, 2);
  });

  test('TU12 - salvarHorarios: lança erro descritivo em caso de bloqueio RLS no DELETE', async () => {
    supabase.from = () => ({
      delete: () => ({
        eq: async () => ({ error: { message: 'new row violates row-level security policy' } }),
      }),
    });

    await assert.rejects(
      async () => await parceiroService.salvarHorarios(1, [{ active: true }]),
      (err) => {
        assert.match(err.message, /Erro de RLS nos horários \(DELETE\)/);
        return true;
      }
    );
  });

  // ==========================================
  // 6. EVENTOS E PROGRAMAÇÃO
  // ==========================================
  test('TU13 - getEventos: retorna lista vazia quando idLocal não for fornecido', async () => {
    const eventos = await parceiroService.getEventos(null);
    assert.deepEqual(eventos, []);
  });

  test('TU14 - criarEvento: cadastra evento com ativo=true', async () => {
    const novoEvento = {
      idLocal: 30,
      titulo: 'Noite do Chopp',
      dias: 'Quarta e Quinta',
      hora: '19:00',
      detalhes: 'Chopp em dobro até 21h',
    };

    supabase.from = (table) => {
      assert.equal(table, 'eventos_locais');
      return {
        insert: (dados) => {
          assert.equal(dados[0].ativo, true);
          assert.equal(dados[0].id_local, 30);
          return {
            select: () => ({
              single: async () => ({ data: { id_evento: 101, ...dados[0] }, error: null }),
            }),
          };
        },
      };
    };

    const criado = await parceiroService.criarEvento(novoEvento);
    assert.equal(criado.id_evento, 101);
    assert.equal(criado.titulo, 'Noite do Chopp');
  });

  test('TU15 - removerEvento: deleta evento por id_evento com sucesso', async () => {
    let deletadoId = null;
    supabase.from = (table) => {
      assert.equal(table, 'eventos_locais');
      return {
        delete: () => ({
          eq: async (col, val) => {
            deletadoId = { col, val };
            return { error: null };
          },
        }),
      };
    };

    const removido = await parceiroService.removerEvento(101);
    assert.equal(removido, true);
    assert.deepEqual(deletadoId, { col: 'id_evento', val: 101 });
  });

  // ==========================================
  // 7. MÉTRICAS E ESTATÍSTICAS
  // ==========================================
  test('TU16 - getMetricasDoLocal: retorna null se idLocal for nulo', async () => {
    const metricas = await parceiroService.getMetricasDoLocal(null);
    assert.equal(metricas, null);
  });

  test('TU17 - registrarMetrica: executa upsert com onConflict por id_local e data', async () => {
    let upsertArgs = null;
    supabase.from = (table) => {
      assert.equal(table, 'metricas_locais');
      return {
        upsert: (rows, options) => {
          upsertArgs = { rows, options };
          return {
            select: () => ({
              single: async () => ({ data: { id_metrica: 1, ...rows[0] }, error: null }),
            }),
          };
        },
      };
    };

    const resultado = await parceiroService.registrarMetrica({
      idLocal: 40,
      data: '2026-10-30',
      views: 15,
      cliques: 5,
      visitas: 2,
    });

    assert.equal(resultado.id_metrica, 1);
    assert.equal(upsertArgs.options.onConflict, 'id_local,data');
    assert.equal(upsertArgs.rows[0].views, 15);
  });

  // ==========================================
  // 8. CAMPANHAS DE IMPULSIONAMENTO
  // ==========================================
  test('TU18 - getCampanhas: filtra por id_local quando informado', async () => {
    let queryFiltroLocal = null;
    supabase.from = (table) => {
      assert.equal(table, 'campanhas_impulsionamento');
      return {
        select: () => ({
          order: () => ({
            eq: async (col, val) => {
              queryFiltroLocal = { col, val };
              return { data: [{ id_campanha: 1, id_local: 50 }], error: null };
            },
          }),
        }),
      };
    };

    const campanhas = await parceiroService.getCampanhas(50);
    assert.deepEqual(queryFiltroLocal, { col: 'id_local', val: 50 });
    assert.equal(campanhas.length, 1);
  });

  test('TU19 - criarCampanha (Destaque): calcula data de término e armazena título/mensagem', async () => {
    let dadosInseridos = null;
    supabase.from = (table) => {
      assert.equal(table, 'campanhas_impulsionamento');
      return {
        insert: (dados) => {
          dadosInseridos = dados[0];
          return {
            select: () => ({
              single: async () => ({ data: { id_campanha: 200, ...dados[0] }, error: null }),
            }),
          };
        },
      };
    };

    const resultado = await parceiroService.criarCampanha({
      idLocal: 50,
      idUsuario: 'uuid-user-partner',
      tipo: 'destaque',
      titulo: 'Combo Estudante R$ 9,90',
      mensagem: 'Com carteirinha de estudante.',
      interesses: ['Almoço barato', 'Universitários'],
      faixaEtaria: '18–24',
      raioKm: 5,
      duracaoDias: 7,
      valorTotal: 420,
    });

    assert.equal(resultado.id_campanha, 200);
    assert.equal(dadosInseridos.tipo, 'destaque');
    assert.equal(dadosInseridos.titulo, 'Combo Estudante R$ 9,90');
    assert.equal(dadosInseridos.mensagem, 'Com carteirinha de estudante.');
    assert.equal(dadosInseridos.duracao_dias, 7);
    assert.equal(dadosInseridos.valor_total, 420);
    assert.ok(dadosInseridos.data_inicio);
    assert.ok(dadosInseridos.data_fim);
  });

  test('TU20 - criarCampanha (Visibilidade): anula campos de destaque específicos', async () => {
    let dadosInseridos = null;
    supabase.from = (table) => {
      assert.equal(table, 'campanhas_impulsionamento');
      return {
        insert: (dados) => {
          dadosInseridos = dados[0];
          return {
            select: () => ({
              single: async () => ({ data: { id_campanha: 201, ...dados[0] }, error: null }),
            }),
          };
        },
      };
    };

    await parceiroService.criarCampanha({
      idLocal: 50,
      idUsuario: 'uuid-user-partner',
      tipo: 'visibilidade',
      titulo: 'Ignorado no modo visibilidade',
      mensagem: 'Ignorado também',
      interesses: ['Música ao vivo'],
      faixaEtaria: 'Todos',
      duracaoDias: 3,
      valorTotal: 180,
    });

    assert.equal(dadosInseridos.tipo, 'visibilidade');
    assert.equal(dadosInseridos.titulo, null);
    assert.equal(dadosInseridos.mensagem, null);
    assert.equal(dadosInseridos.valor_total, 180);
  });

  test('TU21 - getDestaquesAtivos: busca campanhas ativas de destaque com dados dos locais', async () => {
    const mockDestaques = [
      {
        id_campanha: 1,
        id_local: 10,
        tipo: 'destaque',
        titulo: 'Combo Estudante',
        mensagem: 'Pastel + caldo de cana',
        status: 'ativa',
        locais: { id_local: 10, nome: 'Pastelaria Central' },
      },
    ];

    let filtros = {};
    supabase.from = (table) => {
      assert.equal(table, 'campanhas_impulsionamento');
      return {
        select: () => ({
          eq: (col1, val1) => {
            filtros[col1] = val1;
            return {
              eq: (col2, val2) => {
                filtros[col2] = val2;
                return {
                  order: async () => ({ data: mockDestaques, error: null }),
                };
              },
            };
          },
        }),
      };
    };

    const resultado = await parceiroService.getDestaquesAtivos();
    assert.deepEqual(resultado, mockDestaques);
    assert.equal(filtros.tipo, 'destaque');
    assert.equal(filtros.status, 'ativa');
    assert.equal(resultado.length, 1);
  });

  test('TU22 - getDestaquesAtivos: propaga erro quando a consulta falha no banco', async () => {
    supabase.from = () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: { message: 'Erro ao consultar destaques' } }),
          }),
        }),
      }),
    });

    await assert.rejects(
      async () => await parceiroService.getDestaquesAtivos(),
      {
        name: 'Error',
        message: 'Erro ao consultar destaques',
      }
    );
  });

  // ==========================================
  // 9. CADASTRO DIRETO DE NOVO PARCEIRO
  // ==========================================
  test('TU23 - cadastrarNovoParceiro: cria local com visivel=false e id_proprietario', async () => {
    let localInserido = null;
    let horariosInseridos = null;

    supabase.from = (table) => {
      if (table === 'solicitacoes_parceria') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id_solicitacao: 1 }, error: null }),
            }),
          }),
        };
      }
      if (table === 'locais') {
        return {
          insert: (rows) => {
            localInserido = rows[0];
            return {
              select: () => ({
                single: async () => ({
                  data: { id_local: 99, ...rows[0] },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === 'horarios_funcionamento') {
        return {
          insert: async (rows) => {
            horariosInseridos = rows;
            return { error: null };
          },
        };
      }
      throw new Error(`Tabela inesperada: ${table}`);
    };

    const criado = await parceiroService.cadastrarNovoParceiro({
      idUsuario: 'user-uuid-99',
      nome: 'Carlos',
      email: 'carlos@test.com',
      estabelecimento: 'Bar do Carlos',
      cidadeEstado: 'Brasília, DF',
    });

    assert.equal(criado.id_local, 99);
    assert.equal(localInserido.nome, 'Bar do Carlos');
    assert.equal(localInserido.preco, 1);
    assert.equal(localInserido.faixa_preco, '$');
    assert.equal(localInserido.visivel, false);
    assert.equal(localInserido.id_proprietario, 'user-uuid-99');
    assert.equal(horariosInseridos.length, 7);
  });
});


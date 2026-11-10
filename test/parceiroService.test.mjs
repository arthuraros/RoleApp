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
  beforeEach(() => {
    supabase.auth.getUser=async()=>({data:{user:{id:'user-test'}},error:null});
    supabase.rpc=async()=>{throw Error('RPC must be mocked');};
    supabase.from=()=>{throw Error('Query must be mocked');};
  });


  // ==========================================
  // 1. SOLICITAÇÕES DE PARCERIA
  // ==========================================
  test('TU01 - solicitacao usa conta autenticada e status pendente', async () => {
  let inserted;
  supabase.from = table => {
    assert.equal(table,'solicitacoes_parceria');
    return { insert: row => { inserted=row; return { select:()=>({single:async()=>({data:{id_solicitacao:1,...row},error:null})}) }; } };
  };
  const result = await parceiroService.enviarSolicitacaoParceria({idUsuario:'forjado',nome:'Teste',email:'a@b.com',estabelecimento:'Bar',cidadeEstado:'DF'});
  assert.equal(inserted.id_usuario,'user-test'); assert.equal(result.status,'pendente');
});

  test('TU02 - erro de solicitacao nao cria local nem revela erro bruto', async () => {
  supabase.from = table => { assert.equal(table,'solicitacoes_parceria'); return {
    insert:()=>({select:()=>({single:async()=>({data:null,error:{message:'segredo'}})})})
  }; };
  await assert.rejects(parceiroService.enviarSolicitacaoParceria({nome:'A',email:'a@b.com',estabelecimento:'Bar',cidadeEstado:'DF'}), /parceria/);
});

  // ==========================================
  // 2. LOCAIS DO PARCEIRO
  // ==========================================
  test('TU03 - sem usuario nao consulta locais de terceiros', async () => {
  supabase.from=()=>{throw Error('Consulta indevida');};
  assert.deepEqual(await parceiroService.getLocaisDoParceiro(null),[]);
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

  test('TU05 - sem locais proprios retorna vazio sem fallback', async () => {
  let calls=0;
  supabase.from=()=>{calls++;return {select:()=>({eq:()=>({order:async()=>({data:[],error:null})})})};};
  assert.deepEqual(await parceiroService.getLocaisDoParceiro('novo-usuario'),[]); assert.equal(calls,1);
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

  test('TU17 - metrica envia evento unitario por RPC sem upsert', async () => {
  let captured;
  supabase.rpc=async(name,params)=>{captured={name,params};return {data:{registrada:true},error:null};};
  const result=await parceiroService.registrarMetrica({idLocal:40,views:1,data:'2000-01-01'});
  assert.equal(result.registrada,true);
  assert.deepEqual(captured,{name:'registrar_interacao_segura',params:{p_id_local:'40',p_evento:'view'}});
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

  test('TU19 - campanha recebe orcamento e status do servidor', async () => {
  let captured;
  supabase.rpc=async(name,params)=>{captured={name,params};return {data:{status:'rascunho',valor_total:420},error:null};};
  const result=await parceiroService.criarCampanha({idLocal:5,idUsuario:'forjado',tipo:'destaque',titulo:'Oferta',mensagem:'Mensagem',valorTotal:0});
  assert.equal(result.status,'rascunho'); assert.equal(result.valor_total,420);
  assert.equal(captured.name,'solicitar_campanha_segura');
  assert.ok(!('p_valor_total' in captured.params)); assert.ok(!('p_id_usuario' in captured.params));
});

  test('TU20 - visibilidade usa RPC sem ativacao pelo cliente', async () => {
  let captured;
  supabase.rpc=async(name,params)=>{captured=params;return {data:{status:'rascunho',titulo:null},error:null};};
  const result=await parceiroService.criarCampanha({idLocal:5,tipo:'visibilidade',titulo:'Ignorado no servidor'});
  assert.equal(captured.p_tipo,'visibilidade'); assert.ok(!('status' in captured)); assert.equal(result.titulo,null);
});

  test('TU21 - destaques usam projecao publica e exigem local visivel', async () => {
  supabase.rpc=async(name)=>{assert.equal(name,'listar_destaques_publicos');return {data:[{id_campanha:1,locais:{visivel:true}},{id_campanha:2,locais:null}],error:null};};
  assert.deepEqual(await parceiroService.getDestaquesAtivos(),[{id_campanha:1,locais:{visivel:true}}]);
});

  test('TU22 - erro na projecao publica nao retorna dados por fallback', async () => {
  supabase.rpc=async()=>({data:null,error:{message:'segredo'}});
  await assert.rejects(parceiroService.getDestaquesAtivos(), /Oper/);
});

  // ==========================================
  // 9. CADASTRO DIRETO DE NOVO PARCEIRO
  // ==========================================
  test('TU23 - alias de cadastro cria apenas solicitacao pendente', async () => {
  let calls=0;
  supabase.from=table=>{calls++;assert.equal(table,'solicitacoes_parceria');return {insert:row=>({select:()=>({single:async()=>({data:{id_solicitacao:3,...row},error:null})})})};};
  const result=await parceiroService.cadastrarNovoParceiro({nome:'A',email:'a@b.com',estabelecimento:'Bar',cidadeEstado:'DF'});
  assert.equal(result.status,'pendente');assert.equal(result.id_local,undefined);assert.equal(calls,1);
});
});


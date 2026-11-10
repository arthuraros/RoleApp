import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerAccessService } from '../src/services/partnerAccessService.js';

// Testes de contrato do cliente. Não simulam nem comprovam o motor RLS PostgreSQL.
function fixture({ userId = 'conta-real', authError = null, rpcError = null, rpcData = {} } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: authError }) },
    from(table) {
      assert.equal(table, 'solicitacoes_parceria', 'cliente não escreve em locais, campanhas ou métricas');
      return { insert(row) {
        calls.push({ table, row });
        return { select: () => ({ single: async () => ({ data: { id_solicitacao: 1, ...row }, error: null }) }) };
      } };
    },
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: rpcData, error: rpcError };
    },
  };
  return { calls, service: createPartnerAccessService(client) };
}
const form = { nome: ' Nome ', email: ' a@b.com ', estabelecimento: ' Bar ', cidadeEstado: ' DF ' };

test('ativação administrativa envia somente ID e justificativa, sem status/datas/ator forjados', async () => {
  const { service, calls } = fixture({ rpcData: { status: 'ativa' } });
  assert.deepEqual(await service.ativarCampanha({ idCampanha: 8, motivo: ' Condições verificadas ',
    status: 'ativa', data_inicio: '2000-01-01', data_fim: '2099-01-01', actor: 'forjado', duracaoDias: 99 }), { status: 'ativa' });
  assert.deepEqual(calls, [{ name: 'ativar_campanha_segura', params: { p_id_campanha: '8', p_motivo: 'Condições verificadas' } }]);
});
test('ativação sem justificativa não chama RPC', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.ativarCampanha({ idCampanha: 8, motivo: ' ' }), /justificativa/);
  assert.equal(calls.length, 0);
});
test('falha de autorização da ativação não escreve diretamente nem faz fallback', async () => {
  const { service, calls } = fixture({ rpcError: { code: '42501' } });
  await assert.rejects(service.ativarCampanha({ idCampanha: 8, motivo: 'Verificado' }), /não autorizada/);
  assert.deepEqual(calls.map(c => c.name), ['ativar_campanha_segura']);
});

test('anônimo não envia solicitação nem inicia escrita', async () => {
  const { service, calls } = fixture({ userId: null });
  await assert.rejects(service.enviarSolicitacaoParceria(form), /Entre na sua conta/);
  assert.equal(calls.length, 0);
});

test('falha de Auth impede escrita', async () => {
  const { service, calls } = fixture({ authError: new Error('segredo') });
  await assert.rejects(service.enviarSolicitacaoParceria(form), /Entre na sua conta/);
  assert.equal(calls.length, 0);
});

for (const role of ['usuario', 'parceiro', 'admin']) {
  test(`solicitação de ${role} continua própria e pendente apesar de payload forjado`, async () => {
    const { service, calls } = fixture();
    const result = await service.enviarSolicitacaoParceria({ ...form,
      idUsuario: 'outra-conta', status: 'aprovada', role, papel: 'admin', created_at: '2000-01-01',
    });
    assert.equal(result.status, 'pendente');
    assert.deepEqual(calls[0].row, { id_usuario: 'conta-real', nome: 'Nome', email: 'a@b.com',
      estabelecimento: 'Bar', cidade_estado: 'DF', status: 'pendente' });
    assert.equal(calls.length, 1);
  });
}

test('formulário incompleto não insere solicitação', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.enviarSolicitacaoParceria({ ...form, nome: ' ' }), /Preencha/);
  assert.equal(calls.length, 0);
});

for (const [field, event] of [['views', 'view'], ['cliques', 'clique'], ['visitas', 'visita']]) {
  test(`métrica ${event} usa RPC com evento unitário e não transmite data/ator`, async () => {
    const { service, calls } = fixture();
    await service.registrarMetrica({ idLocal: 8, [field]: 1, data: '2000-01-01', idUsuario: 'outro' });
    assert.deepEqual(calls, [{ name: 'registrar_interacao_segura', params: { p_id_local: '8', p_evento: event } }]);
  });
}

for (const payload of [{ views: 15 }, { visitas: -1 }, { views: 1, cliques: 1 }, {}, { views: true }]) {
  test(`métrica arbitrária é recusada: ${JSON.stringify(payload)}`, async () => {
    const { service, calls } = fixture();
    await assert.rejects(service.registrarMetrica({ idLocal: 8, ...payload }), /uma interação/);
    assert.equal(calls.length, 0);
  });
}

test('falha da RPC de métricas não usa fallback de upsert', async () => {
  const { service, calls } = fixture({ rpcError: { message: 'token=segredo' } });
  await assert.rejects(service.registrarMetrica({ idLocal: 8, views: 1 }), /não autorizada/);
  assert.equal(calls.length, 1);
});

test('exceção de transporte da RPC é sanitizada sem fallback', async () => {
  let calls = 0;
  const service = createPartnerAccessService({
    rpc: async () => { calls++; throw new Error('https://servidor/?access_token=segredo'); },
    from: () => { throw new Error('Fallback indevido'); },
  });
  await assert.rejects(service.registrarMetrica({ idLocal: 8, views: 1 }),
    error => /não autorizada/.test(error.message) && !error.message.includes('segredo'));
  assert.equal(calls, 1);
});

test('locais de demonstração não geram telemetria', async () => {
  const { service, calls } = fixture();
  assert.equal(await service.registrarMetrica({ idLocal: 'demo-8', views: 1 }), null);
  assert.equal(calls.length, 0);
});

test('campanha não transmite usuário, preço, status ou datas do cliente', async () => {
  const { service, calls } = fixture({ rpcData: { status: 'rascunho' } });
  const result = await service.criarCampanha({ idLocal: 8, tipo: 'destaque', titulo: ' Oferta ',
    duracaoDias: 7, valorTotal: 0, idUsuario: 'outro', status: 'ativa', dataInicio: '2000-01-01' });
  assert.equal(result.status, 'rascunho');
  assert.deepEqual(calls[0], { name: 'solicitar_campanha_segura', params: {
    p_id_local: '8', p_tipo: 'destaque', p_titulo: 'Oferta', p_mensagem: '', p_interesses: [],
    p_faixa_etaria: 'Todos', p_raio_km: 5, p_duracao_dias: 7,
  } });
});

test('falha de autorização da campanha não faz INSERT direto', async () => {
  const { service, calls } = fixture({ rpcError: { code: '42501' } });
  await assert.rejects(service.criarCampanha({ idLocal: 9, tipo: 'visibilidade' }), /não autorizada/);
  assert.equal(calls.length, 1);
});

for (const days of [0, -1, 1, 5, 30, 3.5, '7', null]) {
  test(`duração fora da constraint real não chama RPC: ${days}`, async () => {
    const { service, calls } = fixture();
    await assert.rejects(service.criarCampanha({ idLocal: 8, tipo: 'destaque', duracaoDias: days }), /duração/);
    assert.equal(calls.length, 0);
  });
}
for (const days of [3, 7, 14]) {
  test(`duração permitida ${days} preserva datas e status sob controle do servidor`, async () => {
    const { service, calls } = fixture({ rpcData: { status: 'rascunho', data_inicio: null, data_fim: null } });
    const result = await service.criarCampanha({ idLocal: 8, tipo: 'destaque', duracaoDias: days,
      status: 'ativa', dataInicio: '2000-01-01', dataFim: '2099-01-01' });
    assert.equal(calls[0].params.p_duracao_dias, days);
    assert.equal('data_inicio' in calls[0].params, false);
    assert.equal('data_fim' in calls[0].params, false);
    assert.equal('status' in calls[0].params, false);
    assert.deepEqual(result, { status: 'rascunho', data_inicio: null, data_fim: null });
  });
}

test('projeção pública não retorna campanhas com local ausente ou oculto', async () => {
  const { service } = fixture({ rpcData: [
    { id: 1, locais: { visivel: true } }, { id: 2, locais: null }, { id: 3, locais: { visivel: false } },
  ] });
  assert.deepEqual(await service.getDestaquesAtivos(), [{ id: 1, locais: { visivel: true } }]);
});

for (const role of ['anon', 'usuario', 'parceiro_pendente', 'parceiro']) {
  test(`erro 42501 de decisão para ${role} não resulta em UPDATE local`, async () => {
    const { service, calls } = fixture({ rpcError: { code: '42501' } });
    await assert.rejects(service.decidirSolicitacao({ reviewId: 'review-1', decisao: 'aprovado', acao: 'vincular_existente',
      idLocalExistente: 6, identidadeValidada: true, duplicidadeRevisada: true, motivo: 'Teste' }), /não autorizada/);
    assert.deepEqual(calls.map(c => c.name), ['decidir_parceria_segura']);
  });
}

test('decisão administrativa transmite só alvo/decisão/motivo; ator vem do banco', async () => {
    const { service, calls } = fixture({ rpcData: { status: 'aprovado' } });
  await service.decidirSolicitacao({ reviewId: 'review-1', decisao: 'aprovado', acao: 'vincular_existente', motivo: ' Verificado ',
    idLocalExistente: 8, identidadeValidada: true, duplicidadeRevisada: true, actor: 'admin-forjado', role: 'admin' });
  assert.deepEqual(calls[0], { name: 'decidir_parceria_segura', params: {
    p_revisao: 'review-1', p_decisao: 'aprovado', p_acao: 'vincular_existente', p_motivo: 'Verificado', p_id_local_existente: '8',
    p_identidade_validada: true, p_duplicidade_revisada: true, p_novo_local: null,
  } });
});

test('decisão inválida não chama RPC', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.decidirSolicitacao({ reviewId: 'review-1', decisao: 'aprovado', motivo: ' ' }), /justificativa/);
  assert.equal(calls.length, 0);
});

test('decisão antiga aprovada é rejeitada; não inventa tradução do estado', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.decidirSolicitacao({ reviewId: 'r', decisao: 'aprovada', motivo: 'Teste' }), /decisão/);
  assert.equal(calls.length, 0);
});

test('aprovação sem escolha ou sem confirmações não chama RPC', async () => {
  for (const change of [{}, { acao: 'criar_novo' }, { acao: 'vincular_existente', idLocalExistente: 6 }]) {
    const { service, calls } = fixture();
    await assert.rejects(service.decidirSolicitacao({ reviewId: 'r', decisao: 'aprovado', motivo: 'Teste', ...change }));
    assert.equal(calls.length, 0);
  }
});

test('nova criação exige dados e envia só campos confirmados', async () => {
  const { service, calls } = fixture();
  await service.decidirSolicitacao({ reviewId: 'r', decisao: 'aprovado', acao: 'criar_novo', motivo: 'Verificado',
    identidadeValidada: true, duplicidadeRevisada: true,
    novoLocal: { endereco: ' Rua A ', preco: 25, preco_entrada: 0, id_proprietario: 'forjado', visivel: true } });
  assert.deepEqual(calls[0].params.p_novo_local, { endereco: 'Rua A', preco: 25, preco_entrada: 0 });
});

for (const [decisao, acao] of [['em_analise', 'bloquear'], ['rejeitado', 'nenhuma']]) {
  test(`${decisao} não atribui proprietário nem cria local`, async () => {
    const { service, calls } = fixture();
    await service.decidirSolicitacao({ reviewId: 'r', decisao, acao, motivo: 'Revisão necessária' });
    assert.equal(calls[0].params.p_novo_local, null);
    assert.equal(calls[0].params.p_id_local_existente, null);
  });
}

test('repetição de envio mantém a revisão e payload de idempotência', async () => {
  const { service, calls } = fixture();
  const input = { reviewId: 'r', decisao: 'rejeitado', acao: 'nenhuma', motivo: 'Duplicado' };
  await service.decidirSolicitacao(input); await service.decidirSolicitacao(input);
  assert.deepEqual(calls[0], calls[1]); // contrato de retry; idempotência real é testada no clone
});

test('fila/revisão/ofertas usam RPCs específicas, sem consulta administrativa direta', async () => {
  const { service, calls } = fixture();
  await service.listarSolicitacoesAdmin(); await service.revisarSolicitacao(2); await service.listarOfertasCampanha();
  assert.deepEqual(calls.map(c => c.name), ['listar_solicitacoes_admin', 'revisar_parceria_segura', 'listar_ofertas_campanha']);
  assert.deepEqual(calls[1].params, { p_id_solicitacao: '2' });
});

import { localEditPayload } from '../utils/partnership.js';
import { createAdminRpcContract, adminPositiveId, adminUuid, adminReason,
  adminMutationReceipt, adminContractError } from './adminRpcContract.js';

// Matches the proposed edit v2 SQL. Create/moderation intentionally have no
// adapter until the real commercial/publication definitions have been supplied.
export function createAdminPlacesMutationsService(client, { contracts = {} } = {}) {
  const rpc = createAdminRpcContract(client, contracts);
  const operations = Object.freeze(Object.fromEntries(['editDetail', 'update', 'visibility'].map(key => [key, contracts[key] === true])));
  const allowed = ['nome', 'descricao', 'telefone', 'faixa_preco', 'endereco', 'bairro', 'cidade_uf'];
  function patch(input) {
    if (!input || Array.isArray(input) || typeof input !== 'object' || !Object.keys(input).length ||
        Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Campos de edição inválidos.');
    localEditPayload(input);
    const result = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== null && typeof value !== 'string') throw new Error('Campos de edição inválidos.');
      const text = value === null ? null : value.trim();
      const limit = key === 'nome' ? 150 : key === 'endereco' ? 255 : 2000;
      if ((text !== null && text.length > limit) || (['nome', 'endereco'].includes(key) && !text) ||
          (key === 'faixa_preco' && text !== null && !['$', '$$', '$$$'].includes(text))) throw new Error('Campos de edição inválidos.');
      result[key] = text;
    }
    return result;
  }
  async function mutate(operation, action, input, fields) {
    rpc.require(operation);
    const id = adminPositiveId(input?.id);
    const version = adminPositiveId(input?.expectedVersion);
    const args = { p_action: action, p_id: id, p_expected_version: version,
      p_patch: fields, p_reason: adminReason(input?.reason), p_idempotency_key: adminUuid(input?.idempotencyKey) };
    const data = await rpc.call(operation, 'roleapp_admin_place_mutate_v2', args);
    return adminMutationReceipt(data, 'id_local', { id, version });
  }
  return {
    operations,
    async editDetail(id) {
      rpc.require('editDetail');
      const requested = adminPositiveId(id);
      const data = await rpc.call('editDetail', 'roleapp_admin_place_edit_detail_v2', { p_id: requested });
      if (data === null) return null;
      try {
        if (!data || data.id_local !== requested || typeof data.version !== 'string' || typeof data.nome !== 'string' ||
            typeof data.endereco !== 'string' || typeof data.visivel !== 'boolean') throw Error();
        adminPositiveId(data.version);
        if (data.id_proprietario !== null) adminUuid(data.id_proprietario);
      } catch { throw adminContractError(); }
      return data;
    },
    async update(input) {
      rpc.require('update');
      return mutate('update', 'editar', input, patch(input?.fields));
    },
    async setVisibility(input) {
      rpc.require('visibility');
      if (typeof input?.visible !== 'boolean') throw new Error('Informe visibilidade válida.');
      return mutate('visibility', 'visibilidade', input, { visivel: input.visible });
    },
  };
}

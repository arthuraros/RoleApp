import { CAMPAIGN_TYPES, CAMPAIGN_DURATIONS, CAMPAIGN_INTERESTS, CAMPAIGN_AGE_RANGES } from '../utils/campaigns.js';
import { createAdminRpcContract, adminPositiveId, adminUuid, adminReason,
  adminPage, adminContractError, adminMutationReceipt } from './adminRpcContract.js';

// Proposed v2 contract, deliberately unavailable until its SQL is installed and
// validated. Never delegates to partner mutations or writes public tables.
const EDITABLE = ['tipo', 'duracao_dias', 'titulo', 'mensagem', 'interesses', 'faixa_etaria', 'raio_km'];
function patch(fields, creating = false) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Object.keys(fields).length ||
      Object.keys(fields).some(key => !EDITABLE.includes(key))) throw Error('Campos de campanha inválidos.');
  const result = { ...fields };
  if ((creating || 'tipo' in fields) && !CAMPAIGN_TYPES.includes(fields.tipo)) throw Error('Tipo inválido.');
  if ((creating || 'duracao_dias' in fields) && !CAMPAIGN_DURATIONS.includes(fields.duracao_dias)) throw Error('Duração inválida.');
  for (const [key, limit] of [['titulo', 200], ['mensagem', 2000]]) {
    if (key in fields) {
      if (typeof fields[key] !== 'string' || fields[key].trim().length > limit) throw Error('Texto inválido.');
      result[key] = fields[key].trim();
    }
  }
  if ('faixa_etaria' in fields && !CAMPAIGN_AGE_RANGES.includes(fields.faixa_etaria)) throw Error('Público inválido.');
  if ('raio_km' in fields && fields.raio_km !== 5) throw Error('Raio não suportado.');
  if ('interesses' in fields) {
    if (!Array.isArray(fields.interesses) || fields.interesses.some(x => !CAMPAIGN_INTERESTS.includes(x)) ||
        new Set(fields.interesses).size !== fields.interesses.length) throw Error('Interesses inválidos.');
    result.interesses = [...fields.interesses];
  }
  if (creating && fields.tipo === 'destaque' && !result.titulo) throw Error('Informe o título.');
  return result;
}
function row(item) {
  try {
    if (!item || typeof item.id_campanha !== 'string' || typeof item.id_local !== 'string' ||
        typeof item.version !== 'string' || typeof item.status !== 'string' || !item.status.trim() ||
        !CAMPAIGN_TYPES.includes(item.tipo) || !CAMPAIGN_DURATIONS.includes(item.duracao_dias) ||
        !(item.titulo === null || typeof item.titulo === 'string')) return false;
    adminPositiveId(item.id_campanha); adminPositiveId(item.id_local); adminPositiveId(item.version); adminUuid(item.id_usuario);
    return true;
  } catch { return false; }
}
export function createAdminCampaignsService(client, { contracts = {} } = {}) {
  const rpc = createAdminRpcContract(client, contracts);
  async function mutate(operation, input, creating = false) {
    rpc.require(operation);
    const args = {
      p_action: operation, p_reason: adminReason(input.reason), p_idempotency_key: adminUuid(input.idempotencyKey),
      p_id: creating ? null : adminPositiveId(input.id),
      p_expected_version: creating ? null : adminPositiveId(input.expectedVersion),
      p_local_id: creating ? adminPositiveId(input.localId) : null,
      p_owner_id: creating ? adminUuid(input.ownerId) : null,
      p_patch: ['create', 'update'].includes(operation) ? patch(input.fields, creating) : {},
    };
    // Status, prices, billing and dates are determined by the backend lifecycle.
    const data = await rpc.call(operation, 'roleapp_admin_campaign_mutate_v2', args);
    const receipt = adminMutationReceipt(data, 'id_campanha', creating ? {} : { id: args.p_id, version: args.p_expected_version });
    if (creating && receipt.version !== '1') throw adminContractError();
    return receipt;
  }
  return Object.freeze({
    available: rpc.approved.list === true && rpc.approved.detail === true,
    contracts: rpc.approved,
    async list({ search = '', status = null, localId = null, ownerId = null, cursor = null } = {}) {
      rpc.require('list');
      if (typeof search !== 'string' || search.trim().length > 120 ||
          !(status === null || (typeof status === 'string' && /^[a-z_]{1,30}$/.test(status))) ||
          !(cursor === null || (typeof cursor === 'string' && cursor.trim() && cursor.length <= 200))) throw Error('Filtro inválido.');
      return adminPage(await rpc.call('list', 'roleapp_admin_campaigns_read_v2', {
        p_search: search.trim(), p_status: status, p_local_id: localId === null ? null : adminPositiveId(localId),
        p_owner_id: ownerId === null ? null : adminUuid(ownerId), p_cursor: cursor, p_limit: 20,
      }), row);
    },
    async detail(id) {
      rpc.require('detail');
      const target = adminPositiveId(id);
      const data = await rpc.call('detail', 'roleapp_admin_campaign_detail_v2', { p_id: target });
      if (data === null) return null;
      if (!row(data) || data.id_campanha !== target) throw adminContractError();
      return data;
    },
    create: input => mutate('create', input, true),
    update: input => mutate('update', input),
    approve: input => mutate('approve', input),
    activate: input => mutate('activate', input),
    pause: input => mutate('pause', input),
    end: input => mutate('end', input),
  });
}

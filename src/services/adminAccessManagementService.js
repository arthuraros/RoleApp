import { createAdminRpcContract, adminPositiveId, adminUuid, adminReason,
  adminPage, adminContractError, adminNextVersion } from './adminRpcContract.js';

// Mirrors the foundation allowlist. This is input validation, never permission
// enforcement: RPCs must recheck actor, subset, self-change and last principal.
export const ADMIN_CAPABILITIES = Object.freeze([
  'locais.ler', 'locais.criar', 'locais.editar', 'locais.visibilidade', 'locais.moderar',
  'campanhas.ler', 'campanhas.criar', 'campanhas.editar', 'campanhas.aprovar',
  'campanhas.ativar', 'campanhas.pausar', 'campanhas.encerrar',
  'administradores.ler', 'administradores.gerenciar',
]);
function capabilities(value) {
  if (!Array.isArray(value) || value.some(cap => !ADMIN_CAPABILITIES.includes(cap)) ||
      new Set(value).size !== value.length) throw Error('Capacidades inválidas.');
  return [...value].sort();
}
function row(item) {
  try {
    adminUuid(item.user_id); adminPositiveId(item.version); capabilities(item.capabilities);
    return typeof item.version === 'string' && typeof item.active === 'boolean' && typeof item.principal === 'boolean';
  } catch { return false; }
}
export function createAdminAccessManagementService(client, { contracts = {} } = {}) {
  const rpc = createAdminRpcContract(client, contracts);
  async function mutate(operation, input) {
    rpc.require(operation);
    const target = adminUuid(input.userId);
    const version = operation === 'grant' && input.expectedVersion === null ? null : adminPositiveId(input.expectedVersion);
    const data = await rpc.call(operation, 'roleapp_admin_access_mutate_v2', {
      p_action: operation, p_user_id: target, p_expected_version: version,
      p_capabilities: operation === 'grant' ? capabilities(input.capabilities) : [],
      p_reason: adminReason(input.reason), p_idempotency_key: adminUuid(input.idempotencyKey),
    });
    try {
      if (!data || data.user_id !== target || typeof data.audit_id !== 'string' || typeof data.version !== 'string') throw Error();
      adminPositiveId(data.audit_id); adminPositiveId(data.version);
      if (data.version !== (version === null ? '1' : adminNextVersion(version))) throw Error();
    } catch { throw adminContractError(); }
    return data;
  }
  return Object.freeze({
    available: rpc.approved.list === true && rpc.approved.detail === true,
    contracts: rpc.approved,
    async list({ search = '', cursor = null } = {}) {
      rpc.require('list');
      if (typeof search !== 'string' || search.trim().length > 120 ||
          !(cursor === null || (typeof cursor === 'string' && cursor.trim() && cursor.length <= 200))) throw Error('Filtro inválido.');
      return adminPage(await rpc.call('list', 'roleapp_admin_access_read_v2', {
        p_search: search.trim(), p_cursor: cursor, p_limit: 20,
      }), row);
    },
    async detail(userId) {
      rpc.require('detail');
      const target = adminUuid(userId);
      const data = await rpc.call('detail', 'roleapp_admin_access_detail_v2', { p_user_id: target });
      if (data === null) return null;
      if (!row(data) || data.user_id !== target) throw adminContractError();
      return data;
    },
    grant: input => mutate('grant', input),
    suspend: input => mutate('suspend', input),
    revoke: input => mutate('revoke', input),
  });
}

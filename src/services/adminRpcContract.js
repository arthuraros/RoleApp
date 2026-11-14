// Shared transport for independently validated administrative contracts.
// Availability flags are release controls; authorization is always in the RPC.
export function adminContractError(message = 'Resposta administrativa incompatível. Nenhuma operação foi confirmada.') {
  return Object.assign(new Error(message), { code: 'ADMIN_CONTRACT_MISMATCH' });
}
export function adminPositiveId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('ID ou versão inválidos.');
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(text) || (text.length === 19 && text > '9223372036854775807')) {
    throw new Error('ID ou versão inválidos.');
  }
  return text;
}
export function adminUuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Identificador UUID inválido.');
  }
  return value.toLowerCase();
}
export function adminReason(value) {
  if (typeof value !== 'string' || value.trim().length < 10 || value.trim().length > 2000) {
    throw new Error('Informe motivo de 10 a 2000 caracteres.');
  }
  return value.trim();
}
export function adminNextVersion(value) {
  const digits = adminPositiveId(value).split('');
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] !== '9') { digits[i] = String(Number(digits[i]) + 1); return digits.join(''); }
    digits[i] = '0';
  }
  return `1${digits.join('')}`;
}
export function adminPage(data, validateRow, limit = 20) {
  if (!data || !Array.isArray(data.items) || data.items.length > limit ||
      !(data.next_cursor === null || (typeof data.next_cursor === 'string' && data.next_cursor.trim() && data.next_cursor.length <= 200)) ||
      data.items.some(item => !validateRow(item))) throw adminContractError();
  return data;
}
export function adminMutationReceipt(data, idField, { id, version } = {}) {
  try {
    if (!data || typeof data[idField] !== 'string' || typeof data.version !== 'string' || typeof data.audit_id !== 'string') throw Error();
    adminPositiveId(data[idField]); adminPositiveId(data.version); adminPositiveId(data.audit_id);
    if ((id !== undefined && data[idField] !== String(id)) ||
        (version !== undefined && data.version !== adminNextVersion(version))) throw Error();
  } catch { throw adminContractError(); }
  return data;
}
export function createAdminRpcContract(client, approved = {}) {
  const contracts = Object.freeze({ ...approved });
  function requireContract(operation) {
    if (contracts[operation] !== true) {
      throw Object.assign(new Error('Operação administrativa bloqueada: contrato ainda não instalado e validado.'), { code: 'ADMIN_CONTRACT_BLOCKED' });
    }
  }
  return {
    approved: contracts,
    require: requireContract,
    async call(operation, rpc, args) {
      requireContract(operation);
      let response;
      try { response = await client.rpc(rpc, args); }
      catch { throw Object.assign(new Error('Falha de conexão. Reutilize a mesma chave ao tentar novamente.'), { code: 'ADMIN_CONNECTION' }); }
      if (response?.error) {
        const code = response.error.code;
        const message = code === '40001' ? 'O registro foi alterado. Recarregue antes de editar.'
          : code === '42501' ? 'Acesso administrativo negado. Verifique suas permissões.'
          : code === 'PGRST202' ? 'Contrato administrativo indisponível no servidor.'
          : 'Operação administrativa não confirmada. Verifique os dados e seu acesso.';
        throw Object.assign(new Error(message), { code: code || 'ADMIN_RPC_ERROR' });
      }
      return response?.data;
    },
  };
}

import { localEditPayload } from './partnership.js';
import { CAMPAIGN_AGE_RANGES, validateCampaignSelection } from './campaigns.js';

export const ADMIN_PLACE_DRAFT_FIELDS = Object.freeze([
  ['nome', 'Nome'], ['descricao', 'Descrição'], ['telefone', 'Telefone'],
  ['faixa_preco', 'Faixa de preço'], ['endereco', 'Endereço'],
  ['bairro', 'Bairro'], ['cidade_uf', 'Cidade/UF'],
]);

// Somente preparação em memória. Nenhum resultado equivale a autorização,
// orçamento, confirmação de proprietário ou payload de RPC já aprovada.
export function prepareAdminSupportDraft(resource, mode, form) {
  if (!['locais', 'campanhas'].includes(resource) || !['create', 'update'].includes(mode)) {
    throw new Error('Preparação inválida.');
  }
  const trimmed = key => String(form[key] ?? '').trim();
  const reason = trimmed('motivo');
  if (reason.length < 10 || reason.length > 2000) throw new Error('Informe motivo de 10 a 2000 caracteres.');
  if (mode === 'update' && (!trimmed('id') || !trimmed('versao'))) {
    throw new Error('Informe ID e versão confirmados pelo servidor antes de editar.');
  }
  let fields;
  if (resource === 'locais') {
    fields = localEditPayload(Object.fromEntries(ADMIN_PLACE_DRAFT_FIELDS.map(([key]) => [key, trimmed(key)])));
    if (Object.values(fields).some(value => !value)) throw new Error('Preencha os dados do estabelecimento.');
    if (mode === 'create' && !trimmed('proprietario')) throw new Error('Informe o parceiro responsável pelo local.');
  } else {
    validateCampaignSelection({ idLocal: trimmed('id_local'), tipo: form.tipo, duracaoDias: Number(form.duracao_dias) });
    if (!CAMPAIGN_AGE_RANGES.includes(form.faixa_etaria) ||
        (form.tipo === 'destaque' && !trimmed('titulo')) || trimmed('titulo').length > 200 ||
        trimmed('mensagem').length > 2000) throw new Error('Confira título, mensagem e público da campanha.');
    fields = { id_local: trimmed('id_local'), tipo: form.tipo, titulo: trimmed('titulo'),
      mensagem: trimmed('mensagem'), duracao_dias: Number(form.duracao_dias),
      faixa_etaria: form.faixa_etaria, raio_km: 5 };
  }
  return { resource, mode, id: mode === 'update' ? trimmed('id') : null,
    expectedVersion: mode === 'update' ? trimmed('versao') : null,
    ownerReference: resource === 'locais' && mode === 'create' ? trimmed('proprietario') : null,
    reason, fields };
}

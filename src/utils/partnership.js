export const REQUEST_STATUS = Object.freeze({
  PENDING: 'pendente', REVIEW: 'em_analise', APPROVED: 'aprovado', REJECTED: 'rejeitado',
});

export function validateDecision({ reviewId, decisao, acao, motivo, idLocalExistente,
  identidadeValidada, duplicidadeRevisada, novoLocal }) {
  if (!reviewId || !motivo?.trim() || !['aprovado', 'rejeitado', 'em_analise'].includes(decisao)) {
    throw new Error('Informe revisão, decisão e justificativa.');
  }
  if (decisao === 'aprovado') {
    if (identidadeValidada !== true || duplicidadeRevisada !== true) {
      throw new Error('Confirme a identidade e a revisão de possíveis duplicações.');
    }
    if (acao === 'vincular_existente' && idLocalExistente != null && !novoLocal) return;
    if (acao === 'criar_novo' && idLocalExistente == null && novoLocal?.endereco?.trim() &&
      Number.isFinite(novoLocal.preco) && novoLocal.preco > 0 &&
      Number.isFinite(novoLocal.preco_entrada) && novoLocal.preco_entrada >= 0) return;
    throw new Error('Selecione explicitamente um vínculo ou informe os dados do novo local.');
  }
  if (idLocalExistente != null || novoLocal ||
    acao !== (decisao === 'em_analise' ? 'bloquear' : 'nenhuma')) {
    throw new Error('Esta decisão não cria nem vincula estabelecimentos.');
  }
}

export const LOCAL_EDIT_FIELDS = Object.freeze([
  'nome', 'descricao', 'telefone', 'faixa_preco', 'endereco', 'bairro', 'cidade_uf', 'visivel',
]);

export function localEditPayload(fields) {
  if (!fields || Object.keys(fields).some(key => !LOCAL_EDIT_FIELDS.includes(key))) {
    throw new Error('Campos de propriedade ou administração não podem ser editados aqui.');
  }
  return { ...fields };
}

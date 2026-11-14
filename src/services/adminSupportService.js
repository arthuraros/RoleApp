// Sem cliente Supabase ou opção de ativação: ainda não existe contrato validado
// para estas operações. Não reutilizar mutações do parceiro para outros donos.
const blocked = async () => {
  throw new Error('Operação administrativa bloqueada: depende de contrato Supabase validado, autorização explícita e auditoria.');
};
export const adminSupportService = Object.freeze({
  locais: Object.freeze({ create: blocked, update: blocked }),
  campanhas: Object.freeze({ available: false, list: blocked, detail: blocked, create: blocked, update: blocked }),
});

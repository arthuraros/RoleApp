// Opções já usadas pelo fluxo de impulsionamento do parceiro.
export const CAMPAIGN_TYPES = Object.freeze(['destaque', 'visibilidade']);
export const CAMPAIGN_DURATIONS = Object.freeze([3, 7, 14]);
export const CAMPAIGN_INTERESTS = Object.freeze([
  'Almoço barato', 'Happy hour', 'Música ao vivo', 'Lanches', 'Café',
  'Vegano', 'Família', 'Universitários', 'Madrugada',
]);
export const CAMPAIGN_AGE_RANGES = Object.freeze(['Todos', '18–24', '25–34', '35+']);

// Mesma validação básica do serviço parceiro; o banco continua sendo autoritativo.
export function validateCampaignSelection({ idLocal, tipo, duracaoDias }) {
  if (!idLocal || !CAMPAIGN_TYPES.includes(tipo) || !CAMPAIGN_DURATIONS.includes(duracaoDias)) {
    throw new Error('Informe local, tipo e duração válidos.');
  }
}

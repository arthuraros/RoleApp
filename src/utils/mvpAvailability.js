// Estado da entrega, nao fonte de autorizacao. So uma revisao futura do backend pode altera-lo.
// Nao vem de metadata, AsyncStorage, parametros de navegacao ou variaveis configuraveis pelo usuario.
export const BACKEND_READINESS = Object.freeze({
  placeManagement: false,
  administration: false,
  partnerMetrics: false,
  campaigns: false,
  placeImages: false,
});

export function isBackendReady(feature) {
  return BACKEND_READINESS[feature] === true;
}

export const FEATURE_TITLES = Object.freeze({
  placeManagement: 'Gestão do estabelecimento',
  administration: 'Painel Administrativo',
  partnerMetrics: 'Estatísticas do parceiro',
  campaigns: 'Campanhas e impulsionamento',
  placeImages: 'Imagens do estabelecimento',
});

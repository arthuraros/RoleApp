export const USER_ROLES = Object.freeze({
  USUARIO: 'usuario',
  PARCEIRO: 'parceiro',
  ADMIN: 'admin',
});

// Somente valores lidos da fonte de autorização no banco devem chegar aqui.
// Metadados do Auth, e-mail e propriedade de locais não concedem papéis.
export function getPermissions(role) {
  return Object.freeze({
    isPartner: role === USER_ROLES.PARCEIRO,
    isAdmin: role === USER_ROLES.ADMIN,
    canAccessPartnerPanel: role === USER_ROLES.PARCEIRO,
    canAccessAdminPanel: role === USER_ROLES.ADMIN,
  });
}

export function normalizeRole(role) {
  return Object.values(USER_ROLES).includes(role) ? role : null;
}

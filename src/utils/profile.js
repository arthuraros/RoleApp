// Nome serve apenas para apresentação. Nunca determina permissões.
export function profileDisplayName(profile, user) {
  const candidates = [profile?.nome, user?.user_metadata?.nome,
    user?.user_metadata?.full_name, user?.user_metadata?.name];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim() || 'Seu perfil';
}

export function supportReport({ assunto, categoria, descricao }) {
  if (!assunto?.trim() || !categoria?.trim() || !descricao?.trim()) {
    throw new Error('Preencha assunto, categoria e descrição.');
  }
  // Somente os dados digitados no formulário; sem sessão, e-mail ou identificadores.
  return `Relato do RolêApp\nAssunto: ${assunto.trim()}\nCategoria: ${categoria.trim()}\n\n${descricao.trim()}`;
}

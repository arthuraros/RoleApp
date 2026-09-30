/**
 * Tradutor e padronizador de mensagens de erro de autenticação para o português
 */
export function getFriendlyAuthErrorMessage(error) {
  if (!error) return '';

  const message = typeof error === 'string' ? error : error.message || '';
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('invalid login credentials') || lowerMessage.includes('invalid credentials')) {
    return 'E-mail ou senha incorretos. Verifique suas credenciais.';
  }

  if (lowerMessage.includes('user already registered') || lowerMessage.includes('already exists')) {
    return 'Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.';
  }

  if (lowerMessage.includes('password should be at least') || lowerMessage.includes('weak password')) {
    return 'A senha é muito fraca. Utilize no mínimo 8 caracteres.';
  }

  if (lowerMessage.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  }

  if (lowerMessage.includes('invalid format') || lowerMessage.includes('invalid email')) {
    return 'O formato do e-mail inserido é inválido.';
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('connection')) {
    return 'Erro de conexão com o servidor. Verifique sua internet.';
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes.';
  }

  return message || 'Ocorreu um erro na autenticação. Tente novamente.';
}

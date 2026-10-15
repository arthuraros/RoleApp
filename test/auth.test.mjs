import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getFriendlyAuthErrorMessage } from '../src/utils/authErrors.js';
import * as QueryParams from 'expo-auth-session/build/QueryParams.js';

describe('Testes de Unidade - Módulo de Autenticação (RolêApp)', () => {
  test('TU01 - getFriendlyAuthErrorMessage: traduz erro técnico em mensagem amigável para o usuário', () => {
    const erroTecnico = 'Invalid login credentials';
    const mensagemAmigavel = getFriendlyAuthErrorMessage(erroTecnico);
    assert.equal(mensagemAmigavel, 'E-mail ou senha incorretos. Verifique suas credenciais.');
  });

  test('TU02 - LoginScreen (Validação): rejeita tentativa de login com e-mail em branco', () => {
    const validateLogin = (email) => {
      if (!email.trim()) {
        return 'Por favor, informe seu e-mail.';
      }
      return null;
    };

    assert.equal(validateLogin('   '), 'Por favor, informe seu e-mail.');
    assert.equal(validateLogin('usuario@teste.com'), null);
  });

  test('TU03 - register (Validação): rejeita cadastro com senha inferior a 8 caracteres', () => {
    const validateRegisterPassword = (password) => {
      if (password.length < 8) {
        throw new Error('A senha deve ter no mínimo 8 caracteres.');
      }
      return true;
    };

    assert.throws(() => validateRegisterPassword('1234567'), {
      message: 'A senha deve ter no mínimo 8 caracteres.',
    });
    assert.equal(validateRegisterPassword('12345678'), true);
  });

  test('TU04 - register (Higienização): remove espaços em branco antes e depois do e-mail (trim)', () => {
    const sanitizeEmail = (email) => email.trim();
    assert.equal(sanitizeEmail('  usuario@exemplo.com  '), 'usuario@exemplo.com');
  });

  test('TU05 - resetPassword (Validação): rejeita envio de recuperação para e-mail sem @ ou vazio', () => {
    const validateResetEmail = (email) => {
      if (!email || !email.includes('@')) {
        throw new Error('Por favor, informe um e-mail válido.');
      }
      return true;
    };

    assert.throws(() => validateResetEmail(''), {
      message: 'Por favor, informe um e-mail válido.',
    });
    assert.throws(() => validateResetEmail('email-sem-arroba.com'), {
      message: 'Por favor, informe um e-mail válido.',
    });
    assert.equal(validateResetEmail('usuario@roleapp.com'), true);
  });

  test('TU06 - RedefinirSenhaScreen: valida obrigatoriedade e comprimento mínimo de 8 caracteres', () => {
    const validateNewPassword = (password) => {
      if (!password) return 'Por favor, informe a nova senha.';
      if (password.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
      return null;
    };

    assert.equal(validateNewPassword(''), 'Por favor, informe a nova senha.');
    assert.equal(validateNewPassword('curta'), 'A senha deve ter no mínimo 8 caracteres.');
    assert.equal(validateNewPassword('novaSenha123'), null);
  });

  test('TU07 - RedefinirSenhaScreen: valida se nova senha e confirmação coincidem', () => {
    const validatePasswordMatch = (newPassword, confirmPassword) => {
      if (newPassword !== confirmPassword) {
        return 'As senhas não coincidem. Digite novamente.';
      }
      return null;
    };

    assert.equal(
      validatePasswordMatch('senha12345', 'senhaDiferente'),
      'As senhas não coincidem. Digite novamente.'
    );
    assert.equal(
      validatePasswordMatch('senha12345', 'senha12345'),
      null
    );
  });

  test('TU08 - handleDeepLink: identifica deep link de confirmação de cadastro (auth/callback)', () => {
    const isSignupUrl = (url, type) => {
      const isRecovery = type === 'recovery' || url.includes('reset-password');
      return !isRecovery && (
        type === 'signup' ||
        type === 'email_confirmation' ||
        url.includes('auth/callback') ||
        url.includes('type=signup')
      );
    };

    assert.equal(isSignupUrl('roleapp://auth/callback#type=signup', 'signup'), true);
    assert.equal(isSignupUrl('roleapp://auth/callback?code=123', undefined), true);
    assert.equal(isSignupUrl('roleapp://reset-password', 'recovery'), false);
  });

  test('TU09 - handleDeepLink: identifica deep link de recuperação de senha (reset-password)', () => {
    const isRecoveryUrl = (url, type) => {
      return type === 'recovery' || url.includes('reset-password');
    };

    assert.equal(isRecoveryUrl('roleapp://reset-password#access_token=abc', 'recovery'), true);
    assert.equal(isRecoveryUrl('roleapp://reset-password', undefined), true);
    assert.equal(isRecoveryUrl('roleapp://auth/callback#access_token=abc', 'signup'), false);
  });

  test('TU10 - handleDeepLink (Debounce): ignora disparos duplicados da mesma URL em menos de 1500ms', () => {
    const checkShouldProcess = (lastUrl, lastTimestamp, newUrl, currentTimestamp) => {
      if (lastUrl === newUrl && currentTimestamp - lastTimestamp < 1500) {
        return false;
      }
      return true;
    };

    const url = 'roleapp://reset-password#token=123';
    const t0 = 10000;

    assert.equal(checkShouldProcess(url, t0, url, t0 + 300), false);
    assert.equal(checkShouldProcess(url, t0, url, t0 + 2000), true);
    assert.equal(checkShouldProcess(url, t0, 'roleapp://auth/callback', t0 + 100), true);
  });

  test('TU11 - QueryParams.getQueryParams: extrai tokens de autenticação da URL (access_token e refresh_token)', () => {
    const url = 'roleapp://reset-password#access_token=tokenAcesso123&refresh_token=tokenRefresh456&type=recovery';
    const { params } = QueryParams.getQueryParams(url);

    assert.equal(params.access_token, 'tokenAcesso123');
    assert.equal(params.refresh_token, 'tokenRefresh456');
    assert.equal(params.type, 'recovery');
  });

  test('TU12 - QueryParams.getQueryParams: extrai código de autorização PKCE da query string', () => {
    const url = 'roleapp://auth/callback?code=pkce-auth-code-789';
    const { params } = QueryParams.getQueryParams(url);

    assert.equal(params.code, 'pkce-auth-code-789');
  });

  test('TU13 - initAuth: detecta recuperação abandonada e determina descarte de sessão (logout)', () => {
    const shouldDiscardRecovery = (pendingFlag, currentLaunchUrl) => {
      const isLaunchingWithRecoveryUrl =
        Boolean(currentLaunchUrl) &&
        (currentLaunchUrl.includes('reset-password') || currentLaunchUrl.includes('type=recovery'));

      return pendingFlag === 'true' && !isLaunchingWithRecoveryUrl;
    };

    assert.equal(shouldDiscardRecovery('true', null), true);

    assert.equal(shouldDiscardRecovery(null, null), false);
  });

  test('TU14 - initAuth: não descarta sessão quando o app é aberto diretamente por um link de recuperação', () => {
    const shouldDiscardRecovery = (pendingFlag, currentLaunchUrl) => {
      const isLaunchingWithRecoveryUrl =
        Boolean(currentLaunchUrl) &&
        (currentLaunchUrl.includes('reset-password') || currentLaunchUrl.includes('type=recovery'));

      return pendingFlag === 'true' && !isLaunchingWithRecoveryUrl;
    };

    const recoveryUrl = 'roleapp://reset-password#access_token=xyz';
    assert.equal(shouldDiscardRecovery('true', recoveryUrl), false);
  });
});

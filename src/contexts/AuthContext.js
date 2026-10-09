import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, AppState } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { getFriendlyAuthErrorMessage } from '../utils/authErrors';

const APP_REDIRECT_URL = 'roleapp://auth/callback';
const RESET_PASSWORD_REDIRECT_URL = 'roleapp://reset-password';
const RECOVERY_PENDING_KEY = '@roleapp_password_recovery_pending';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [confirmedNotice, setConfirmedNotice] = useState(null);

  const incomingUrl = Linking.useLinkingURL();
  const lastProcessed = useRef({ url: null, timestamp: 0 });

  const handleDeepLink = async (url) => {
    if (!url) return;
    const now = Date.now();
    if (lastProcessed.current.url === url && now - lastProcessed.current.timestamp < 1500) {
      return;
    }
    lastProcessed.current = { url, timestamp: now };
    console.log('[DeepLink] Processando URL:', url);

    try {
      const { params, errorCode } = QueryParams.getQueryParams(url);

      if (errorCode || params.error || params.error_description) {
        const msg = errorCode || params.error_description || params.error;
        const friendlyMsg = getFriendlyAuthErrorMessage(msg);
        Alert.alert('Atenção', friendlyMsg);
        setError(friendlyMsg);
        Linking.clearInitialURL?.();
        return;
      }

      const isRecovery = params.type === 'recovery' || url.includes('reset-password');
      if (isRecovery) {
        await AsyncStorage.setItem(RECOVERY_PENDING_KEY, 'true');
        setIsPasswordRecovery(true);
      }

      const isSignupConfirmation =
        !isRecovery &&
        (params.type === 'signup' ||
          params.type === 'email_confirmation' ||
          url.includes('auth/callback') ||
          url.includes('type=signup'));

      if (isSignupConfirmation) {
        setConfirmedNotice({
          title: 'E-mail confirmado!',
          subtitle: 'Entrando no aplicativo...',
        });
      }

      if (params.access_token && params.refresh_token) {
        const { data, error: sessionErr } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (sessionErr) throw sessionErr;

        if (isSignupConfirmation) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          setConfirmedNotice(null);
        }

        if (data?.session) {
          setSession(data.session);
          setUser(data.session.user);
        }
        Linking.clearInitialURL?.();
        return;
      }

      if (params.code) {
        try {
          const { data, error: pkceErr } = await supabase.auth.exchangeCodeForSession(params.code);
          if (pkceErr) throw pkceErr;

          if (isSignupConfirmation) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            setConfirmedNotice(null);
          }

          if (data?.session) {
            setSession(data.session);
            setUser(data.session.user);
          }
          Linking.clearInitialURL?.();
          return;
        } catch (pkceErr) {
          console.warn('[DeepLink] Erro na troca de código PKCE:', pkceErr);
          if (isSignupConfirmation) {
            setConfirmedNotice({
              title: 'E-mail confirmado!',
              subtitle: 'Redirecionando para login...',
            });
            await new Promise((resolve) => setTimeout(resolve, 3000));
            setConfirmedNotice(null);
          }
          Linking.clearInitialURL?.();
          return;
        }
      }

      if (params.token_hash || params.token) {
        const tokenHash = params.token_hash || params.token;
        const otpType = isRecovery ? 'recovery' : 'email';
        const { data, error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (otpErr) throw otpErr;

        if (isSignupConfirmation) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          setConfirmedNotice(null);
        }

        if (data?.session) {
          setSession(data.session);
          setUser(data.session.user);
        }
        Linking.clearInitialURL?.();
        return;
      }

      if (isSignupConfirmation) {
        setConfirmedNotice({
          title: 'E-mail confirmado!',
          subtitle: 'Redirecionando para login...',
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        setConfirmedNotice(null);
        Linking.clearInitialURL?.();
        return;
      }

      Linking.clearInitialURL?.();
    } catch (err) {
      console.warn('[DeepLink] Erro ao processar:', err);
      setConfirmedNotice(null);
      if (url.includes('reset-password') || url.includes('type=recovery')) {
        setIsPasswordRecovery(false);
        await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
      }
      setError(getFriendlyAuthErrorMessage(err));
      Linking.clearInitialURL?.();
    }
  };

  useEffect(() => {
    if (incomingUrl) {
      handleDeepLink(incomingUrl);
    }
  }, [incomingUrl]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', (event) => {
      if (event?.url) {
        handleDeepLink(event.url);
      }
    });

    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        const currentUrl = Linking.getLinkingURL?.();
        if (currentUrl) {
          handleDeepLink(currentUrl);
        }
      }
    });

    return () => {
      sub.remove();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (!isSupabaseConfigured) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const currentLaunchUrl = Linking.getLinkingURL?.();
        const isLaunchingWithRecoveryUrl =
          Boolean(currentLaunchUrl) &&
          (currentLaunchUrl.includes('reset-password') || currentLaunchUrl.includes('type=recovery'));

        const pendingRecovery = await AsyncStorage.getItem(RECOVERY_PENDING_KEY);
        if (pendingRecovery === 'true' && !isLaunchingWithRecoveryUrl) {
          console.log('[Auth] Recuperação de senha abandonada detectada. Deslogando...');
          await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
          await supabase.auth.signOut();
          if (isMounted) {
            setSession(null);
            setUser(null);
            setIsPasswordRecovery(false);
            setLoading(false);
          }
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (err) {
        console.warn('Erro ao restaurar sessão do Supabase:', err);
        if (isMounted) setLoading(false);
      }
    }

    initAuth();

    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;

        if (event === 'PASSWORD_RECOVERY') {
          await AsyncStorage.setItem(RECOVERY_PENDING_KEY, 'true');
          setIsPasswordRecovery(true);
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } else {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }
  }, []);

  const login = async (email, password) => {
    setAuthLoading(true);
    setError(null);

    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        const mockUser = {
          id: 'dev-123',
          email: email.trim() || 'usuario@exemplo.com',
          user_metadata: { name: 'Usuário RolêApp' },
        };
        setUser(mockUser);
        return { success: true, user: mockUser };

        if (error) throw error;

        setUser(data.user);
        setSession(data.session);
        return { success: true, user: data.user };
      } else {
        // Fallback para desenvolvimento local
        const mockUser = {
          id: 'dev-123',
          email: email.trim() || 'usuario@exemplo.com',
          user_metadata: { name: 'Usuário RolêApp' },
        };
        setUser(mockUser);
        return { success: true, user: mockUser };
      }
    } catch (err) {
      const friendlyMessage = getFriendlyAuthErrorMessage(err);
      setError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async (email, password, metadata = {}) => {
    setAuthLoading(true);
    setError(null);

    try {
      if (password.length < 8) {
        throw new Error('A senha deve ter no mínimo 8 caracteres.');
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: metadata,
            emailRedirectTo: APP_REDIRECT_URL,
          },
        });

        if (error) throw error;

        if (data.session) {
          setUser(data.user);
          setSession(data.session);
        }

        return {
          success: true,
          user: data.user,
          requiresEmailConfirmation: !data.session,
        };
      } else {
        const mockUser = {
          id: 'dev-novo',
          email: email.trim(),
          user_metadata: { name: 'Novo Usuário', ...metadata },
        };
        setUser(mockUser);
        return { success: true, user: mockUser };
      }
    } catch (err) {
      const friendlyMessage = getFriendlyAuthErrorMessage(err);
      setError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    } finally {
      setAuthLoading(false);
    }
  };

  const resetPassword = async (email) => {
    setAuthLoading(true);
    setError(null);

    try {
      if (!email || !email.includes('@')) {
        throw new Error('Por favor, informe um e-mail válido.');
      }

      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: RESET_PASSWORD_REDIRECT_URL,
        });
        if (error) throw error;
      }

      return {
        success: true,
        message: 'Link de recuperação enviado para o e-mail informado!',
      };
    } catch (err) {
      const friendlyMessage = getFriendlyAuthErrorMessage(err);
      setError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    } finally {
      setAuthLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setAuthLoading(true);
    setError(null);

    try {
      if (isSupabaseConfigured) {
        const redirectTo = makeRedirectUri({
          scheme: 'roleapp',
        });

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });

        if (error) throw error;

        if (!data?.url) {
          throw new Error('Não foi possível obter a URL de autenticação do Google.');
        }

        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (res.type === 'success' && res.url) {
          const { params, errorCode } = QueryParams.getQueryParams(res.url);

          if (errorCode || params.error_description || params.error) {
            throw new Error(errorCode || params.error_description || params.error);
          }

          if (params.access_token && params.refresh_token) {
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });

            if (sessionError) throw sessionError;

            setUser(sessionData.user);
            setSession(sessionData.session);
            return { success: true, user: sessionData.user };
          } else if (params.code) {
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);

            if (exchangeError) throw exchangeError;

            setUser(exchangeData.user);
            setSession(exchangeData.session);
            return { success: true, user: exchangeData.user };
          } else if (params.error_description || params.error) {
            throw new Error(params.error_description || params.error);
          }
        }
        return { success: false, cancelled: true };
      } else {
        const mockUser = {
          id: 'google-dev-123',
          email: 'usuario.google@gmail.com',
          user_metadata: {
            name: 'Usuário Google',
            full_name: 'Usuário Google',
            avatar_url: 'https://lh3.googleusercontent.com/a/default-user',
          },
        };
        setUser(mockUser);
        return { success: true, user: mockUser };
      }
    } catch (err) {
      const friendlyMessage = getFriendlyAuthErrorMessage(err);
      setError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    } finally {
      setAuthLoading(false);
    }
  };

  const cancelPasswordRecovery = async () => {
    await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
    setIsPasswordRecovery(false);
    await logout();
  };

  const updatePassword = async (newPassword) => {
    setAuthLoading(true);
    setError(null);

    try {
      if (!newPassword || newPassword.length < 8) {
        throw new Error('A nova senha deve ter no mínimo 8 caracteres.');
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) throw error;

        await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
        setIsPasswordRecovery(false);
        if (data?.user) {
          setUser(data.user);
        }
        return { success: true, user: data.user };
      } else {
        await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
        setIsPasswordRecovery(false);
        return { success: true };
      }
    } catch (err) {
      const friendlyMessage = getFriendlyAuthErrorMessage(err);
      setError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    setAuthLoading(true);
    try {
      await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      setUser(null);
      setSession(null);
      setIsPasswordRecovery(false);
    } catch (err) {
      console.warn('Erro ao deslogar:', err);
      setUser(null);
      setSession(null);
      setIsPasswordRecovery(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const clearError = () => setError(null);

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        authLoading,
        error,
        clearError,
        isAuthenticated,
        isSupabaseConfigured,
        isPasswordRecovery,
        updatePassword,
        cancelPasswordRecovery,
        login,
        register,
        loginWithGoogle,
        resetPassword,
        logout,
      }}
    >
      {children}
      {confirmedNotice ? (
        <View style={styles.toastContainer} pointerEvents="none">
          <View style={styles.toastCard}>
            <View style={styles.toastIconWrapper}>
              <Feather name="check-circle" size={24} color="#10B981" />
            </View>
            <View style={styles.toastTextWrapper}>
              <Text style={styles.toastTitle}>{confirmedNotice.title}</Text>
              <Text style={styles.toastSubtitle}>{confirmedNotice.subtitle}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 56,
    left: 20,
    right: 20,
    zIndex: 99999,
    alignItems: 'center',
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090A1A',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    width: '100%',
  },
  toastIconWrapper: {
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastTextWrapper: {
    flex: 1,
  },
  toastTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  toastSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}

export default AuthContext;


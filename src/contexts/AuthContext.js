import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { getFriendlyAuthErrorMessage } from '../utils/authErrors';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Se o Supabase estiver configurado, recupera a sessão ativa salva no AsyncStorage
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }).catch((err) => {
        console.warn('Erro ao restaurar sessão do Supabase:', err);
        setLoading(false);
      });

      // Listener em tempo real para mudanças no estado de autenticação
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // Modo local simulado enquanto o usuário não cola suas chaves
      setLoading(false);
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
          },
        });

        if (error) throw error;

        // Se o Supabase exigir confirmação de e-mail, session pode ser null
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
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
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

  const logout = async () => {
    setAuthLoading(true);
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      setUser(null);
      setSession(null);
    } catch (err) {
      console.warn('Erro ao deslogar:', err);
      setUser(null);
      setSession(null);
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
        login,
        register,
        resetPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}

export default AuthContext;

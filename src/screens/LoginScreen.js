import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { AuthInput } from '../components/AuthInput';
import { SocialButtons } from '../components/SocialButtons';

export function LoginScreen({ navigation }) {
  const { login, loginWithGoogle, authLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleGoogleLogin = async () => {
    setLocalError('');
    clearError();
    const result = await loginWithGoogle();
    if (!result.success && result.error) {
      setLocalError(result.error);
    }
  };

  const handleLogin = async () => {
    setLocalError('');
    clearError();

    if (!email.trim()) {
      setLocalError('Por favor, informe seu e-mail.');
      return;
    }
    if (!password) {
      setLocalError('Por favor, informe sua senha.');
      return;
    }

    const result = await login(email, password);
    if (!result.success && result.error) {
      setLocalError(result.error);
    }
  };

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      subtitle="Entre com suas credenciais para acessar sua conta"
      error={localError || error}
    >
      {/* Campo E-mail */}
      <AuthInput
        label="Email"
        iconName="mail"
        placeholder="SeuE_mail123@gmail.com"
        value={email}
        onChangeText={(val) => {
          setEmail(val);
          if (localError) setLocalError('');
        }}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {/* Campo Senha */}
      <AuthInput
        label="Senha"
        iconName="lock"
        placeholder="••••••••"
        value={password}
        onChangeText={(val) => {
          setPassword(val);
          if (localError) setLocalError('');
        }}
        secureTextEntry
      />

      {/* Linha Lembrar-me e Esqueceu a senha */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.checkboxWrapper}
          activeOpacity={0.7}
          onPress={() => setRememberMe(!rememberMe)}
        >
          <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
            {rememberMe ? <Feather name="check" size={12} color="#FFFFFF" /> : null}
          </View>
          <Text style={styles.checkboxLabel}>Lembrar-me</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Recuperacao')}
        >
          <Text style={styles.forgotPasswordText}>Esqueceu a senha?</Text>
        </TouchableOpacity>
      </View>

      {/* Botão Entrar */}
      <TouchableOpacity
        style={[styles.primaryButton, authLoading && styles.buttonDisabled]}
        onPress={handleLogin}
        activeOpacity={0.8}
        disabled={authLoading}
      >
        {authLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      {/* Link para Cadastro */}
      <View style={styles.footerLinkRow}>
        <Text style={styles.footerText}>Não tem uma conta? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Cadastro')}>
          <Text style={styles.footerLinkBold}>Cadastre-se</Text>
        </TouchableOpacity>
      </View>

      {/* Botão Social Google */}
      <SocialButtons
        onGooglePress={handleGoogleLogin}
        text="Fazer Login com o Google"
        loading={authLoading}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    marginTop: 2,
  },
  checkboxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.2,
    borderColor: '#94A3B8',
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  checkboxActive: {
    backgroundColor: '#090A1A',
    borderColor: '#090A1A',
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  forgotPasswordText: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#090A1A',
    borderRadius: 12,
    height: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  footerLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#64748B',
  },
  footerLinkBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#090A1A',
  },
});

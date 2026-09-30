import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { AuthInput } from '../components/AuthInput';
import { SocialButtons } from '../components/SocialButtons';

export function CadastroScreen({ navigation }) {
  const { register, authLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleRegister = async () => {
    setLocalError('');
    clearError();

    if (!email.trim()) {
      setLocalError('Por favor, informe seu e-mail.');
      return;
    }

    if (!password) {
      setLocalError('Por favor, informe uma senha.');
      return;
    }

    if (password.length < 8) {
      setLocalError('A senha deve conter no mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('As senhas não coincidem. Digite novamente.');
      return;
    }

    if (!acceptTerms) {
      setLocalError('Você precisa aceitar os Termos de Serviço para continuar.');
      return;
    }

    const result = await register(email, password);
    if (!result.success && result.error) {
      setLocalError(result.error);
    } else if (result.requiresEmailConfirmation) {
      Alert.alert(
        'Cadastro realizado!',
        'Enviamos um link de confirmação para o seu e-mail. Por favor, confirme para ativar sua conta.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    }
  };

  return (
    <AuthLayout
      title="Cadastre-se"
      subtitle="Entre com suas credenciais para criar sua conta"
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
        sublabel="no mínimo 8 caracteres"
        iconName="lock"
        placeholder="••••••••"
        value={password}
        onChangeText={(val) => {
          setPassword(val);
          if (localError) setLocalError('');
        }}
        secureTextEntry
      />

      {/* Campo Confirme sua senha */}
      <AuthInput
        label="Confirme sua senha"
        iconName="lock"
        placeholder="••••••••"
        value={confirmPassword}
        onChangeText={(val) => {
          setConfirmPassword(val);
          if (localError) setLocalError('');
        }}
        secureTextEntry
      />

      {/* Checkbox Termos de Serviço */}
      <View style={styles.termsRow}>
        <TouchableOpacity
          style={styles.checkboxWrapper}
          activeOpacity={0.7}
          onPress={() => setAcceptTerms(!acceptTerms)}
        >
          <View style={[styles.checkbox, acceptTerms && styles.checkboxActive]}>
            {acceptTerms ? <Feather name="check" size={12} color="#FFFFFF" /> : null}
          </View>
        </TouchableOpacity>

        <View style={styles.termsTextWrapper}>
          <Text style={styles.termsText}>Li e aceito os </Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Termos de Serviço', 'Termos de serviço do RolêApp.')}
          >
            <Text style={styles.termsLink}>Termos de Serviço</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Botão Entrar / Cadastrar */}
      <TouchableOpacity
        style={[styles.primaryButton, authLoading && styles.buttonDisabled]}
        onPress={handleRegister}
        activeOpacity={0.8}
        disabled={authLoading}
      >
        {authLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      {/* Link para Login */}
      <View style={styles.footerLinkRow}>
        <Text style={styles.footerText}>Já tem uma conta? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.footerLinkBold}>Entre</Text>
        </TouchableOpacity>
      </View>

      {/* Botões Sociais Google e Facebook */}
      <SocialButtons
        onGooglePress={() => alert('Cadastro com Google em desenvolvimento')}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    marginTop: 2,
  },
  checkboxWrapper: {
    paddingRight: 6,
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
  },
  checkboxActive: {
    backgroundColor: '#090A1A',
    borderColor: '#090A1A',
  },
  termsTextWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  termsText: {
    fontSize: 12,
    color: '#64748B',
  },
  termsLink: {
    fontSize: 12,
    color: '#3B82F6',
    textDecorationLine: 'underline',
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

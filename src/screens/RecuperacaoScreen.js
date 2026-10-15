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

export function RecuperacaoScreen({ navigation }) {
  const { resetPassword, authLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleReset = async () => {
    setLocalError('');
    setSuccessMessage('');
    clearError();

    if (!email.trim()) {
      setLocalError('Por favor, informe seu e-mail.');
      return;
    }

    const result = await resetPassword(email);
    if (!result.success && result.error) {
      setLocalError(result.error);
    } else {
      setSuccessMessage(
        'E-mail de recuperação enviado! Verifique sua caixa de entrada para criar uma nova senha.'
      );
    }
  };

  return (
    <AuthLayout
      title="Redefinir senha"
      subtitle="Coloque seu E-mail o qual deseja redefinir a senha"
      error={localError || error}
    >
      {/* Mensagem de Sucesso */}
      {successMessage ? (
        <View style={styles.successBox}>
          <Feather name="check-circle" size={18} color="#15803D" style={styles.successIcon} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      {/* Campo E-mail */}
      <AuthInput
        label="E-mail"
        iconName="mail"
        placeholder="SeuE_mail123@gmail.com"
        value={email}
        onChangeText={(val) => {
          setEmail(val);
          if (localError) setLocalError('');
          if (successMessage) setSuccessMessage('');
        }}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {/* Botão Enviar */}
      <TouchableOpacity
        style={[styles.primaryButton, authLoading && styles.buttonDisabled]}
        onPress={handleReset}
        activeOpacity={0.8}
        disabled={authLoading}
      >
        {authLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Enviar</Text>
        )}
      </TouchableOpacity>

      {/* Link para Login */}
      <View style={styles.footerLinkRow}>
        <Text style={styles.footerText}>Já tem uma conta? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.footerLinkBold}>Entre</Text>
        </TouchableOpacity>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    width: '100%',
  },
  successIcon: {
    marginRight: 8,
  },
  successText: {
    flex: 1,
    fontSize: 12,
    color: '#15803D',
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#090A1A',
    borderRadius: 12,
    height: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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

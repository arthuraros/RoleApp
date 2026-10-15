import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { AuthInput } from '../components/AuthInput';

export function RedefinirSenhaScreen() {
  const { updatePassword, cancelPasswordRecovery, authLoading, error, clearError } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    const backAction = () => {
      cancelPasswordRecovery();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [cancelPasswordRecovery]);

  const handleUpdatePassword = async () => {
    setLocalError('');
    clearError();

    if (!newPassword) {
      setLocalError('Por favor, informe a nova senha.');
      return;
    }

    if (newPassword.length < 8) {
      setLocalError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError('As senhas não coincidem. Digite novamente.');
      return;
    }

    const result = await updatePassword(newPassword);
    if (!result.success && result.error) {
      setLocalError(result.error);
    } else {
      Alert.alert(
        'Senha Atualizada!',
        'Sua nova senha foi salva com sucesso.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <AuthLayout
      title="Nova Senha"
      subtitle="Crie uma nova senha para acessar a sua conta"
      error={localError || error}
    >
      <AuthInput
        label="Nova Senha"
        sublabel="no mínimo 8 caracteres"
        iconName="lock"
        placeholder="••••••••"
        value={newPassword}
        onChangeText={(val) => {
          setNewPassword(val);
          if (localError) setLocalError('');
        }}
        secureTextEntry
      />

      <AuthInput
        label="Confirmar Nova Senha"
        iconName="lock"
        placeholder="••••••••"
        value={confirmPassword}
        onChangeText={(val) => {
          setConfirmPassword(val);
          if (localError) setLocalError('');
        }}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.primaryButton, authLoading && styles.buttonDisabled]}
        onPress={handleUpdatePassword}
        activeOpacity={0.8}
        disabled={authLoading}
      >
        {authLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Salvar Nova Senha</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footerLinkRow}>
        <TouchableOpacity onPress={cancelPasswordRecovery}>
          <Text style={styles.footerLinkBold}>Voltar ao Login</Text>
        </TouchableOpacity>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
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
    marginTop: 8,
  },
  footerLinkBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#090A1A',
  },
});

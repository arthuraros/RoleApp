import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { StatusBar } from 'expo-status-bar';

export function LoginScreen() {
  const { user, login } = useAuth();
  return (
    <View style={styles.container}>
      <Text>LoginScreen</Text>
      <Button title="Entrar na Conta" onPress={() => login('usuario@exemplo.com', '123456')} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

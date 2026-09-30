import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { StatusBar } from 'expo-status-bar';

export function PerfilScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.container}>
      <Text>PerfilScreen</Text>
      <Button title="Sair da Conta" onPress={logout} />
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

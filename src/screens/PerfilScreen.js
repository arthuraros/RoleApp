import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { StatusBar } from 'expo-status-bar';

export function PerfilScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PerfilScreen</Text>
      {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      <View style={styles.buttonWrapper}>
        <Button title="Sair da Conta" color="#DC2626" onPress={logout} />
      </View>
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

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export function AccessGate({ role, children }) {
  const { role: currentRole, profileLoading } = useAuth();
  if (profileLoading) return <ActivityIndicator accessibilityLabel="Verificando acesso" />;
  if (currentRole !== role) return (
    <View style={{ padding: 24 }}><Text>Acesso indisponível para o perfil atual.</Text></View>
  );
  return children;
}

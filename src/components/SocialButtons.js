import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

export function SocialButtons({ onGooglePress }) {
  return (
    <View style={styles.container}>
      <View style={styles.buttonsRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onGooglePress}
          style={styles.socialCircle}
          accessibilityLabel="Entrar com Google"
        >
          <FontAwesome5 name="google" size={24} color="#EA4335" />
          <Text style={styles.text}>Fazer Login com o Google</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  text: {
    fontWeight: 500,
  },
  socialCircle: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    flexDirection: 'row',
    gap: 20,
  },
});

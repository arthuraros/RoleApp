import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurTargetView } from 'expo-blur';

import { useAuth } from '../contexts/AuthContext';
import { CustomTabBar } from '../components/CustomTabBar';

import { LoginScreen } from '../screens/LoginScreen';
import { CadastroScreen } from '../screens/CadastroScreen';
import { RecuperacaoScreen } from '../screens/RecuperacaoScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { FavoritosScreen } from '../screens/FavoritosScreen';
import { MapaScreen } from '../screens/MapaScreen';
import { PerfilScreen } from '../screens/PerfilScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Cadastro" component={CadastroScreen} />
      <Stack.Screen name="Recuperacao" component={RecuperacaoScreen} />
    </Stack.Navigator>
  );
}

function AppNavigator() {
  const blurTargetRef = useRef(null);

  return (
    <BlurTargetView ref={blurTargetRef} style={styles.blurTarget}>
      <Tab.Navigator
        initialRouteName="Home"
        tabBar={(props) => <CustomTabBar {...props} blurTarget={blurTargetRef} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Início' }} />
        <Tab.Screen name="Favoritos" component={FavoritosScreen} />
        <Tab.Screen name="Mapa" component={MapaScreen} />
        <Tab.Screen name="Perfil" component={PerfilScreen} />
      </Tab.Navigator>
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  blurTarget: {
    flex: 1,
  },
});

export function Navigation() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

export default Navigation;

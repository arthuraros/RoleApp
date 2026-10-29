import React, { useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
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
import { RedefinirSenhaScreen } from '../screens/RedefinirSenhaScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { FavoritosScreen } from '../screens/FavoritosScreen';
import { MapaScreen } from '../screens/MapaScreen';
import { PerfilScreen } from '../screens/PerfilScreen';
import { SejaParceiroScreen } from '../screens/SejaParceiroScreen';
import { PainelParceiroScreen } from '../screens/PainelParceiroScreen';
import { EstatisticasParceiroScreen } from '../screens/EstatisticasParceiroScreen';
import { ImpulsionarScreen } from '../screens/ImpulsionarScreen';
import { EditarLocaisScreen } from '../screens/EditarLocaisScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Cadastro" component={CadastroScreen} />
      <Stack.Screen name="Recuperacao" component={RecuperacaoScreen} />
      <Stack.Screen name="RedefinirSenha" component={RedefinirSenhaScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
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

function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="SejaParceiro" component={SejaParceiroScreen} />
      <Stack.Screen name="PainelParceiro" component={PainelParceiroScreen} />
      <Stack.Screen name="EstatisticasParceiro" component={EstatisticasParceiroScreen} />
      <Stack.Screen name="Impulsionar" component={ImpulsionarScreen} />
      <Stack.Screen name="EditarLocais" component={EditarLocaisScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  blurTarget: {
    flex: 1,
  },
});

export function Navigation() {
  const { isAuthenticated, isPasswordRecovery, loading } = useAuth();
  const handleNavigationReady = React.useCallback(() => {
    SplashScreen.hideAsync().catch((error) => {
      console.warn('Erro ao ocultar SplashScreen:', error);
    });
  }, []);

  if (loading) {
    return null;
  }

  return (
    <NavigationContainer onReady={handleNavigationReady}>
      {isPasswordRecovery ? (
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="RedefinirSenha" component={RedefinirSenhaScreen} />
        </Stack.Navigator>
      ) : isAuthenticated ? (
        <AppNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
export default Navigation;

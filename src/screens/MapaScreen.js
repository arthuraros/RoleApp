import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export function MapaScreen() {
  return (
    <View style={styles.container}>
      <Text>MapaScreen</Text>
      <Text style={{ color: 'white', fontSize: 30 }}>MapaScreen</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#160086ff',
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

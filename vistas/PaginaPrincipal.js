// vistas/PaginaPrincipal.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function PaginaPrincipal({ navigation }) {
  const user = auth.currentUser;

  const handleLogout = async () => {
    await signOut(auth);
    //  usa el nombre real de tu pantalla de login
    navigation.replace('Logins');
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Text variant="headlineSmall" style={{ marginBottom: 8 }}>
          Bienvenido {user?.email || 'usuario'}
        </Text>
        <Button mode="contained" onPress={handleLogout}>
          Cerrar sesión
        </Button>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { padding: 20, borderRadius: 16 },
});

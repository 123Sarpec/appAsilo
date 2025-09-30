// vistas/Logins.js
import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text, Card, Portal, Dialog, ActivityIndicator } from 'react-native-paper';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase'; // ajusta la ruta si es necesario

export default function Logins({ navigation }) {
  // --- TODOS los hooks, siempre en el mismo orden y sin condiciones ---
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);

  const [openReg, setOpenReg] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regPass2, setRegPass2] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  // --------------------------------------------------------------------

  const handleLogin = async () => {
    if (!email || !pass) return Alert.alert('Atención', 'Ingresa correo y contraseña');
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      navigation.replace('PaginaPrincipal');
    } catch (e) {
      const code = e?.code || '';
      let msg = 'Error al iniciar sesión.';
      if (code.includes('user-not-found')) msg = 'Usuario no encontrado.';
      else if (code.includes('wrong-password')) msg = 'Contraseña incorrecta.';
      else if (code.includes('invalid-email')) msg = 'Correo inválido.';
      else if (code.includes('too-many-requests')) msg = 'Demasiados intentos. Intenta más tarde.';
      Alert.alert('Login', msg);
      console.log('Auth error:', code, e.message);
    } finally {
      setLoading(false);
    }
  };

  const openRegisterModal = () => {
    setRegName('');
    setRegEmail('');
    setRegPass('');
    setRegPass2('');
    setOpenReg(true);
  };

  const handleRegister = async () => {
    if (!regName.trim() || !regEmail.trim() || !regPass || !regPass2)
      return Alert.alert('Registro', 'Completa todos los campos.');
    if (regPass !== regPass2)
      return Alert.alert('Registro', 'Las contraseñas no coinciden.');

    try {
      setRegLoading(true);
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPass);
      await updateProfile(cred.user, { displayName: regName.trim() });

      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: regName.trim(),
        email: regEmail.trim(),
        createdAt: serverTimestamp(),
        role: 'user',
        active: true,
      });

      setOpenReg(false);
      Alert.alert('Registro', 'Cuenta creada correctamente. ¡Ahora puedes ingresar!');
    } catch (e) {
      const code = e?.code || '';
      let msg = 'No se pudo crear la cuenta.';
      if (code.includes('email-already-in-use')) msg = 'Ese correo ya está registrado.';
      else if (code.includes('invalid-email')) msg = 'Correo inválido.';
      else if (code.includes('weak-password')) msg = 'Contraseña muy débil (mín. 6).';
      Alert.alert('Registro', msg);
      console.log('Register error:', code, e.message);
    } finally {
      setRegLoading(false);
    }
  };

  // Puedes mostrar un spinner de pantalla completa, pero OJO: los hooks ya están definidos arriba
  // if (loading) return <ActivityIndicator />  // <- válido si está después de los hooks

  return (
    <View style={styles.container}>
      <Card style={styles.card} mode="elevated">
        <Text variant="headlineMedium" style={{ marginBottom: 12, textAlign: 'center' }}>
          Iniciar sesión
        </Text>

        <TextInput
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ marginBottom: 8 }}
        />
        <TextInput
          label="Contraseña"
          value={pass}
          onChangeText={setPass}
          secureTextEntry
          style={{ marginBottom: 12 }}
        />

        <Button mode="contained" onPress={handleLogin} loading={loading}>
          Entrar
        </Button>

        <Button mode="text" onPress={openRegisterModal} style={{ marginTop: 10 }}>
          Crear cuenta
        </Button>
      </Card>

      <Portal>
        <Dialog visible={openReg} onDismiss={() => setOpenReg(false)}>
          <Dialog.Title>Crear cuenta</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Nombre completo" value={regName} onChangeText={setRegName} style={{ marginBottom: 8 }} />
            <TextInput label="Correo" value={regEmail} onChangeText={setRegEmail} autoCapitalize="none" keyboardType="email-address" style={{ marginBottom: 8 }} />
            <TextInput label="Contraseña" value={regPass} onChangeText={setRegPass} secureTextEntry style={{ marginBottom: 8 }} />
            <TextInput label="Confirmar contraseña" value={regPass2} onChangeText={setRegPass2} secureTextEntry style={{ marginBottom: 8 }} />
            {regLoading ? <ActivityIndicator style={{ marginTop: 4 }} /> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpenReg(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleRegister} disabled={regLoading}>Registrarse</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { padding: 20, borderRadius: 16 },
});

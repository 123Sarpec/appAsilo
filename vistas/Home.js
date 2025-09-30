// vistas/Home.js
import React from 'react';
import { View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import auth from '@react-native-firebase/auth';

export default function Home({ navigation }) {
  const go = (name) => navigation.navigate(name);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Card style={{ padding: 16, marginBottom: 12 }}>
        <Text variant="titleLarge">Panel principal</Text>
        <View style={{ height: 12 }} />

        {/* Usa los nombres EXACTOS declarados en HomeTabs */}
        <Button mode="contained" onPress={() => go('Medicos')} style={{ marginBottom: 8 }}>
          Médicos
        </Button>
        <Button mode="contained" onPress={() => go('PacienteAgregar')} style={{ marginBottom: 8 }}>
          Pacientes
        </Button>
        <Button mode="contained" onPress={() => go('MedicamentoAgregar')} style={{ marginBottom: 8 }}>
          Medicamentos
        </Button>
        {/* No tienes 'Usuarios' en el Tab/Stack; quítalo o crea la pantalla */}
        {/* <Button mode="contained" onPress={() => go('Usuarios')} style={{ marginBottom: 8 }}>
          Usuarios
        </Button> */}
        <Button mode="contained" onPress={() => go('ProgramarMedicamento')} style={{ marginBottom: 8 }}>
          Programar
        </Button>
        <Button mode="contained" onPress={() => go('Inventarios')}>
          Inventario
        </Button>

        <View style={{ height: 16 }} />
        <Button mode="text" onPress={() => auth().signOut()}>Cerrar sesión</Button>
      </Card>

      <Card style={{ padding: 16 }}>
        <Text>Atajo: ir a módulo de Medicamentos (lista compacta con FAB).</Text>
        <Button style={{ marginTop: 8 }} mode="outlined" onPress={() => go('MedicamentoAgregar')}>
          Abrir Medicamentos
        </Button>
      </Card>
    </View>
  );
}

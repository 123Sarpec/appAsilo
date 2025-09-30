// navigation/AppNavigator.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Tabs
import HomeTabs from './HomeTabs';

// Screens (vistas)
import PaginaPrincipal from '../vistas/PaginaPrincipal';
import Dashboard from '../vistas/Dashboard';
import Inventarios from '../vistas/Inventarios';
import Medicos from '../vistas/Medicos';
import PacienteAgregar from '../vistas/PacienteAgregar';
import MedicamentoAgregar from '../vistas/MedicamentoAgregar';
import ProgramarMedicamento from '../vistas/ProgramarMedicamento';
import Logins from '../vistas/Logins';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
        {/* Tabs */}
        <Stack.Screen name="Tabs" component={HomeTabs} />

        {/* Rutas planas (si entras desde botones) */}
        <Stack.Screen name="PaginaPrincipal" component={PaginaPrincipal} />
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen name="Inventarios" component={Inventarios} />
        <Stack.Screen name="Medicos" component={Medicos} />
        <Stack.Screen name="PacienteAgregar" component={PacienteAgregar} />
        <Stack.Screen name="MedicamentoAgregar" component={MedicamentoAgregar} />
        <Stack.Screen name="ProgramarMedicamento" component={ProgramarMedicamento} />
        <Stack.Screen name="Logins" component={Logins} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

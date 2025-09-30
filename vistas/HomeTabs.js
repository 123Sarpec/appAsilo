// vistas/HomeTabs.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import Dashboard from './Dashboard';
import PacienteAgregar from './PacienteAgregar';
import MedicamentoAgregar from './MedicamentoAgregar';
import Inventarios from './Inventarios';
import ProgramarMedicamento from './ProgramarMedicamento';
import Medicos from './Medicos';

const Tab = createBottomTabNavigator();

export default function HomeTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#1565C0',
        tabBarInactiveTintColor: '#8FA3B0',
        tabBarStyle: {
          height: 62,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          backgroundColor: '#FFFFFF',
          position: 'absolute',
          overflow: 'hidden',
          elevation: 8,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={Dashboard}
        options={{ tabBarIcon: ({ color }) => <Icon name="view-dashboard" color={color} size={28} /> }}
      />
      <Tab.Screen
        name="Medicos"
        component={Medicos}
        options={{ tabBarIcon: ({ color }) => <Icon name="doctor" color={color} size={28} /> }}
      />
      <Tab.Screen
        name="PacienteAgregar"
        component={PacienteAgregar}
        options={{ tabBarIcon: ({ color }) => <Icon name="account-plus" color={color} size={28} /> }}
      />
      <Tab.Screen
        name="MedicamentoAgregar"
        component={MedicamentoAgregar}
        options={{ tabBarIcon: ({ color }) => <Icon name="pill" color={color} size={28} /> }}
      />
      <Tab.Screen
        name="Inventarios"
        component={Inventarios}
        options={{ tabBarIcon: ({ color }) => <Icon name="clipboard-list" color={color} size={28} /> }}
      />
      <Tab.Screen
        name="ProgramarMedicamento"
        component={ProgramarMedicamento}
        options={{ tabBarIcon: ({ color }) => <Icon name="calendar-clock" color={color} size={28} /> }}
      />
    </Tab.Navigator>
  );
}

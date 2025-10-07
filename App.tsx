import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3LightTheme, IconButton } from 'react-native-paper';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

import Logins from './vistas/Logins';
import HomeTabs from './vistas/HomeTabs';

const Stack = createNativeStackNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1565C0',
    secondary: '#00BFA5',
  },
};

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Login"
            component={Logins}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PaginaPrincipal"
            component={HomeTabs}
            options={({ navigation }) => ({
              title: 'App Asilo',
              headerTitleAlign: 'center',          // centrado
              headerStyle: {
                backgroundColor: '#33b6ea',        // celeste como tab inferior
              },
              headerTintColor: '#fff',             // texto blanco
              headerTitleStyle: {
                fontWeight: 'bold',
                fontSize: 20,
              },
              headerRight: () => (
                <IconButton
                  icon="logout"
                  iconColor="#fff"                 // ícono blanco
                  onPress={async () => {
                    await signOut(auth);
                    navigation.replace('Login');
                  }}
                  accessibilityLabel="Cerrar sesión"
                />
              ),
            })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

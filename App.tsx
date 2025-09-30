import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3LightTheme, IconButton } from 'react-native-paper';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

import Logins from './vistas/Logins';
import HomeTabs from './vistas/HomeTabs';
import AppNavigator from './navigation/AppNavigator';


const Stack = createNativeStackNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1565C0',    // azul profesional
    secondary: '#00BFA5',  // acento
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
              headerRight: () => (
                <IconButton
                  icon="logout"
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

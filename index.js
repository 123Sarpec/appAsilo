import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// --- Notifee: descuento en inventario al dispararse la notificación ---
import notifee, { EventType } from '@notifee/react-native';
import { db } from './firebase';
import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';

// Util para convertir nombre a id de inventario (igual que slug)
function invIdFromName(name = '') {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Este handler corre aunque la app esté cerrada (Android)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  try {
    if (type === EventType.TRIGGER_NOTIFICATION_CREATED) {
      const data = detail?.notification?.data || {};
      const nombre = data.medicamentoNombre;
      const dosis = Number(data.dosisPorToma || 0);
      if (!nombre || !dosis) return;

      const invId = invIdFromName(nombre);
      const ref = doc(db, 'inventarios', invId);

      await updateDoc(ref, {
        stock: increment(-dosis),
        consumido: increment(dosis),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    // Evitamos romper el proceso en background
    console.log('onBackgroundEvent error:', e?.message || e);
  }
});

AppRegistry.registerComponent(appName, () => App);

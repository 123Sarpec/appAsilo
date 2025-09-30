// hooks/useAuthReady.js
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// Espera a que Firebase Auth esté listo y devuelve { user, loading }
export default function useAuthReady() {
  const [user, setUser] = useState(() => auth.currentUser ?? null);
  const [loading, setLoading] = useState(user == null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, loading };
}

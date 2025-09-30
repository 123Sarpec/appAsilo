// hooks/useCollectionRT.js
import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Suscripción genérica a una colección. Ordena en cliente por createdAt desc si existe.
export default function useCollectionRT(colName, { enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return;
    }

    const ref = collection(db, colName);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!mounted.current) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Orden estable por createdAt (Timestamp). Si no existe, lo manda al final.
        list.sort((a, b) => (b?.createdAt?.seconds ?? 0) - (a?.createdAt?.seconds ?? 0));
        setItems(list);
        setLoading(false);
      },
      (err) => {
        if (!mounted.current) return;
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      mounted.current = false;
      unsub && unsub();
    };
  }, [colName, enabled]);

  return { items, loading, error };
}

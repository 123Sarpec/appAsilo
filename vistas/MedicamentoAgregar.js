// vistas/MedicamentoAgregar.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import {
  Appbar, Card, Text, TextInput, Button, IconButton, Portal, Modal, FAB,
  Snackbar, Divider, ActivityIndicator, Searchbar, TouchableRipple
} from 'react-native-paper';
import { FlatList } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Firebase
import { db, auth } from '../firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query as fsQuery, orderBy, serverTimestamp, increment, setDoc, getDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Helpers
const slug = (s = '') =>
  s.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const fmtDate = (ts) => {
  try {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  } catch { return ''; }
};

export default function MedicamentoAgregar() {
  // State
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('create'); // create | edit
  const [current, setCurrent] = useState(null);

  const [snack, setSnack] = useState({ visible: false, text: '' });
  const [form, setForm] = useState({
    nombre: '',
    dosis: '',
    fechaIngreso: '',
    cantidad: '',
  });

  // Auth + snapshot
  useEffect(() => {
    let unsub;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { setLoading(false); return; }

      const qMed = fsQuery(collection(db, 'medicamentos'), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(
        qMed,
        (snap) => {
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => {
          console.log('onSnapshot medicamentos error:', err);
          setLoading(false);
          setSnack({ visible: true, text: err.code || 'Error' });
        }
      );
    });

    return () => { unsubAuth && unsubAuth(); unsub && unsub(); };
  }, []);

  // Helpers
  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const showSnack = (t) => setSnack({ visible: true, text: t });

  const openCreate = () => {
    setMode('create');
    setCurrent(null);
    setForm({
      nombre: '',
      dosis: '',
      fechaIngreso: new Date().toISOString().split('T')[0],
      cantidad: '',
    });
    setVisible(true);
  };

  const openEdit = (row) => {
    setMode('edit');
    setCurrent(row);
    setForm({
      nombre: row.nombre ?? '',
      dosis: row.dosis ?? '',
      fechaIngreso: row.fechaIngreso || fmtDate(row.createdAt) || '',
      cantidad: String(row.cantidad ?? ''),
    });
    setVisible(true);
  };

  // Inventario: aplicar delta a inventarios/{slug(nombre)}
  const applyInventoryDelta = async (nombre, delta) => {
    if (!nombre || !delta || isNaN(delta)) return;
    const invId = slug(nombre);
    const ref = doc(db, 'inventarios', invId);
    const now = serverTimestamp();

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { nombre, stock: delta, createdAt: now, updatedAt: now });
    } else {
      await updateDoc(ref, { stock: increment(delta), updatedAt: now });
    }
  };

  // Validación
  const validate = () => {
    if (!form.nombre.trim()) return 'El nombre del medicamento es obligatorio.';
    if (!form.fechaIngreso) return 'La fecha de ingreso es obligatoria.';
    const cant = Number(form.cantidad);
    if (!Number.isFinite(cant) || cant <= 0) return 'Cantidad inválida.';
    return null;
  };

  // Guardar / Actualizar
  const save = async () => {
    const err = validate();
    if (err) return showSnack(err);

    const base = {
      nombre: form.nombre.trim(),
      dosis: form.dosis.trim(),
      fechaIngreso: String(form.fechaIngreso),
      cantidad: Number(form.cantidad),
    };

    try {
      if (mode === 'create') {
        await addDoc(collection(db, 'medicamentos'), { ...base, createdAt: serverTimestamp() });
        await applyInventoryDelta(base.nombre, base.cantidad);
        showSnack('Medicamento agregado y stock actualizado.');
      } else {
        const prevNombre = current?.nombre ?? base.nombre;
        const prevCant = Number(current?.cantidad ?? 0);
        const newCant = base.cantidad;

        if (base.nombre === prevNombre) {
          const delta = newCant - prevCant;
          if (delta) await applyInventoryDelta(base.nombre, delta);
        } else {
          if (prevCant) await applyInventoryDelta(prevNombre, -prevCant);
          if (newCant) await applyInventoryDelta(base.nombre, newCant);
        }

        await updateDoc(doc(db, 'medicamentos', current.id), { ...base, updatedAt: serverTimestamp() });
        showSnack('Medicamento actualizado y stock ajustado.');
      }
      setVisible(false);
    } catch (e) {
      console.log('save medicamento error:', e);
      showSnack(`Error al guardar: ${e.code || e.message}`);
    }
  };

  // Eliminar
  const remove = (row) => {
    Alert.alert('Eliminar', `¿Borrar “${row.nombre}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'medicamentos', row.id));
            await applyInventoryDelta(row.nombre, -Number(row.cantidad || 0));
            showSnack('Medicamento eliminado y stock ajustado.');
          } catch (e) {
            console.log('delete medicamento error:', e);
            showSnack(`No se pudo eliminar: ${e.code || e.message}`);
          }
        },
      },
    ]);
  };

  // Filtro y UI
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => [x.nombre, x.dosis, x.fechaIngreso].join(' ').toLowerCase().includes(s));
  }, [items, q]);

  const Separator = () => <Divider />;

  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title="Medicamentos" subtitle="Stock automático al inventario" />
        <Appbar.Action icon="plus" onPress={openCreate} />
      </Appbar.Header>

      <View style={styles.container}>
        <Searchbar placeholder="Buscar por nombre, dosis o fecha…" value={q} onChangeText={setQ} style={{ marginBottom: 10 }} />

        <Card style={styles.card} mode="elevated">
          <Card.Content style={{ paddingTop: 0 }}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8, color: '#6B7C87' }}>Cargando…</Text>
              </View>
            ) : (
              <View style={{ height: 520 }}>
                <FlatList
                  data={filtered}
                  keyExtractor={(it) => it.id}
                  ItemSeparatorComponent={Separator}
                  ListEmptyComponent={
                    <View style={{ paddingVertical: 16 }}>
                      <Text style={{ color: '#6B7C87' }}>Sin resultados</Text>
                    </View>
                  }
                  renderItem={({ item: row, index }) => (
                    <View key={row.id}>
                      <TouchableRipple rippleColor="rgba(0,0,0,0.08)" onLongPress={() => openEdit(row)}>
                        <View style={styles.itemRow}>
                          {/* Ícono en vez de inicial */}
                          <View style={{ marginRight: 12 }}>
                            <Icon name="pill" size={28} color="#1565C0" />
                          </View>

                          <View style={styles.itemBody}>
                            <View style={styles.itemHeader}>
                              <Text numberOfLines={1} style={styles.itemTitle}>{row.nombre}</Text>
                              <Text style={styles.itemDate}>{row.fechaIngreso || fmtDate(row.createdAt)}</Text>
                            </View>
                            <Text style={styles.itemSub}>Dosis: {row.dosis || '—'}</Text>
                          </View>

                          <View style={styles.qtyPill}>
                            <Text style={{ fontWeight: '700' }}>{row.cantidad ?? 0}</Text>
                          </View>

                          <View style={{ flexDirection: 'row' }}>
                            <IconButton icon="pencil" onPress={() => openEdit(row)} />
                            <IconButton icon="delete" onPress={() => remove(row)} />
                          </View>
                        </View>
                      </TouchableRipple>
                      {index < filtered.length - 1 && <Divider />}
                    </View>
                  )}
                />
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      <FAB style={styles.fab} icon="plus" onPress={openCreate} />

      {/* Modal crear/editar */}
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={{ marginBottom: 12 }}>
            {mode === 'create' ? 'Agregar medicamento' : 'Editar medicamento'}
          </Text>

          <TextInput label="Nombre del medicamento *" value={form.nombre} onChangeText={(v) => onChange('nombre', v)} style={styles.input} />
          <TextInput label="Dosis (ej. 500mg)" value={form.dosis} onChangeText={(v) => onChange('dosis', v)} style={styles.input} />
          <TextInput label="Fecha de ingreso * (YYYY-MM-DD)" value={form.fechaIngreso} onChangeText={(v) => onChange('fechaIngreso', v)} style={styles.input} />
          <TextInput label="Cantidad *" value={form.cantidad} onChangeText={(v) => onChange('cantidad', v)} keyboardType="numeric" style={styles.input} />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button onPress={() => setVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={save}>{mode === 'create' ? 'Guardar' : 'Actualizar'}</Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar visible={snack.visible} onDismiss={() => setSnack({ visible: false, text: '' })} duration={2500}>
        {snack.text}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  card: { borderRadius: 16 },
  center: { alignItems: 'center', paddingVertical: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#FFFFFF' },
  itemBody: { flex: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'center' },
  itemTitle: { flex: 1, fontWeight: '600', fontSize: 16, color: '#0F172A' },
  itemDate: { marginLeft: 8, color: '#64748B', fontSize: 12 },
  itemSub: { marginTop: 2, color: '#607D8B' },

  qtyPill: {
    minWidth: 40, height: 28, paddingHorizontal: 8, borderRadius: 999,
    backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 10,
  },

  modal: { margin: 16, backgroundColor: 'white', padding: 16, borderRadius: 16, maxHeight: '90%' },
  input: { marginBottom: 10 },
});

// vistas/Medicos.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, FlatList, TouchableOpacity } from 'react-native';
import {
  Appbar, Searchbar, List, IconButton, Portal, Modal, TextInput,
  Button, Card, Snackbar, Text, FAB, Divider, Avatar, ActivityIndicator,
} from 'react-native-paper';

import { db, auth } from '../firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query as fsQuery, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function Medicos() {
  // Estado
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [currentId, setCurrentId] = useState(null);
  const [form, setForm] = useState({ nombre: '', cui: '', telefono: '', especialidad: '', correo: '' });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [snack, setSnack] = useState({ visible: false, text: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Helpers
  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const showSnack = (t) => setSnack({ visible: true, text: t });
  const openView = (row) => { setViewRow(row); setViewOpen(true); };

  const openCreate = () => {
    setMode('create');
    setCurrentId(null);
    setForm({ nombre: '', cui: '', telefono: '', especialidad: '', correo: '' });
    setVisible(true);
  };
  const openEdit = (row) => {
    setMode('edit');
    setCurrentId(row.id);
    setForm({
      nombre: row.nombre ?? '',
      cui: String(row.cui ?? ''),
      telefono: String(row.telefono ?? ''),
      especialidad: row.especialidad ?? '',
      correo: row.correo ?? '',
    });
    setVisible(true);
  };

  // Espera auth y suscríbete a Firestore
  useEffect(() => {
    let unsubSnap;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setAuthReady(true);
      if (!u) { setLoading(false); return; }

      const q = fsQuery(collection(db, 'medicos')); // sin orderBy (ordenamos en cliente)
      unsubSnap = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
          setItems(list);
          setLoading(false);
        },
        (err) => {
          setLoading(false);
          showSnack(`Error: ${err.code || err.message}`);
        }
      );
    });

    return () => { unsubAuth && unsubAuth(); unsubSnap && unsubSnap(); };
  }, []);

  // Validación
  const validate = () => {
    if (!form.nombre.trim()) return 'El nombre completo es obligatorio.';
    if (form.cui && !/^\d{4,}$/.test(form.cui.trim())) return 'CUI inválido (solo números).';
    if (form.telefono && !/^\d{8}$/.test(form.telefono.trim())) return 'Teléfono inválido (8 dígitos).';
    if (form.correo && !/\S+@\S+\.\S+/.test(form.correo.trim())) return 'Correo inválido.';
    return null;
  };

  // Guardar / Actualizar
  const save = async () => {
    const err = validate();
    if (err) return showSnack(err);

    const base = {
      nombre: form.nombre.trim(),
      cui: form.cui.trim(),
      telefono: form.telefono.trim(),
      especialidad: form.especialidad.trim(),
      correo: form.correo.trim(),
    };

    try {
      if (mode === 'create') {
        await addDoc(collection(db, 'medicos'), { ...base, createdAt: serverTimestamp() });
        showSnack('Médico agregado.');
      } else {
        await updateDoc(doc(db, 'medicos', currentId), { ...base, updatedAt: serverTimestamp() });
        showSnack('Médico actualizado.');
      }
      setVisible(false);
      setSelectedId(null);
    } catch (e) {
      showSnack(`No se pudo guardar: ${e.code || e.message}`);
    }
  };

  // Eliminar
  const remove = (row) => {
    Alert.alert('Eliminar', `¿Borrar al médico “${row.nombre}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'medicos', row.id));
            showSnack('Médico eliminado.');
            setSelectedId(null);
          } catch (e) {
            showSnack(`No se pudo eliminar: ${e.code || e.message}`);
          }
        },
      },
    ]);
  };

  // Filtro
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) =>
      [x.nombre || '', x.cui || '', x.telefono || '', x.especialidad || '', x.correo || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [items, query]);

  const Separator = () => <Divider />;

  const isBusy = loading || !authReady;

  return (
    <View style={{ flex: 1, }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title=" Registros Médicos" subtitle="Lista (Firestore)" />
        <Appbar.Action icon="plus" onPress={openCreate} />
      </Appbar.Header>

      <View style={styles.container}>
        <Searchbar
          placeholder="Buscar por nombre, CUI, teléfono..."
          value={query}
          onChangeText={setQuery}
          // style={styles.search}
          style={{ marginBottom: 10, backgroundColor: '#0483a04b', borderRadius: 16 }}
          inputStyle={{ color: '#111010ff' }}
        />

        <Card style={styles.card} mode="elevated">
          <Card.Title title="Médicos registrados" />
          <Card.Content style={{ paddingTop: 0 }}>
            {isBusy ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8, color: '#6B7C87' }}>Cargando…</Text>
              </View>
            ) : (
              // 🔧 Altura garantizada para que la FlatList se vea aunque un padre le quite flex
              <View style={{ height: 520 }}>
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  ItemSeparatorComponent={Separator}
                  ListEmptyComponent={
                    <View style={{ paddingVertical: 12 }}>
                      <Text style={{ color: '#6B7C87' }}>Sin resultados</Text>
                    </View>
                  }
                  renderItem={({ item: row }) => {
                    const isSelected = selectedId === row.id;
                    const initial = (row?.nombre || 'M')[0]?.toUpperCase?.() || 'M';

                    return (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedId(isSelected ? null : row.id)}
                        onLongPress={() => openEdit(row)}
                      >
                        <List.Item
                          title={row.nombre}
                          titleStyle={styles.itemTitle}
                          description={
                            row.telefono
                              ? `Tel: ${row.telefono} · Esp: ${row.especialidad || '—'}`
                              : `Esp: ${row.especialidad || '—'}`
                          }
                          descriptionStyle={styles.itemDesc}
                          left={(props) => (
                            <Avatar.Text
                              {...props}
                              size={40}
                              label={initial}
                              style={styles.avatar}
                              onTouchEnd={() => openView(row)}
                            />
                          )}
                          right={() =>
                            isSelected ? (
                              <View style={styles.actions}>
                                <IconButton icon="pencil" onPress={() => openEdit(row)} />
                                <IconButton icon="delete" onPress={() => remove(row)} />
                              </View>
                            ) : (
                              <IconButton icon="chevron-right" disabled />
                            )
                          }
                        />
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      <FAB style={styles.fab} icon="plus" onPress={openCreate} />

      {/* Modal Crear/Editar */}
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={{ marginBottom: 8 }}>
            {mode === 'create' ? 'Agregar médico' : 'Editar médico'}
          </Text>

          <TextInput label="Nombre completo *" value={form.nombre} onChangeText={(v) => onChange('nombre', v)} style={styles.input} />
          <TextInput label="CUI" value={form.cui} onChangeText={(v) => onChange('cui', v)} keyboardType="numeric" style={styles.input} />
          <TextInput label="Teléfono" value={form.telefono} onChangeText={(v) => onChange('telefono', v)} keyboardType="numeric" style={styles.input} />
          <TextInput label="Especialidad" value={form.especialidad} onChangeText={(v) => onChange('especialidad', v)} style={styles.input} />
          <TextInput label="Correo" value={form.correo} onChangeText={(v) => onChange('correo', v)} keyboardType="email-address" style={styles.input} />

          <View style={styles.modalActions}>
            <Button mode="text" onPress={() => setVisible(false)}>Cancelar</Button>
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
  search: { marginBottom: 10, borderRadius: 12 },
  card: { borderRadius: 16 },
  center: { alignItems: 'center', paddingVertical: 16 },
  itemTitle: { fontWeight: '600' },
  itemDesc: { color: '#01080dff' },
  avatar: { backgroundColor: '#1e88e5' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16 },
  modal: { margin: 16, backgroundColor: 'white', padding: 16, borderRadius: 16, maxHeight: '90%' },
  input: { marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});

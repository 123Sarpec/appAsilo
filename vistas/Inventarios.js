// vistas/Inventarios.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  TextInput,
  Button,
  IconButton,
  Portal,
  Modal,
  FAB,
  Snackbar,
  Divider,
  ActivityIndicator,
  Chip,
  Searchbar,
  List,
} from 'react-native-paper';
import { FlatList } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { db, auth } from '../firebase';
import {
  collection,
  doc,
  onSnapshot,
  query as fsQuery,
  orderBy,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  getDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// =========== Helpers ===========
const slug = (s = '') =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const fmtDate = ts => {
  try {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  } catch {
    return '';
  }
};

const LOW_STOCK = 10;

// =========== Componente ===========
export default function Inventarios() {
  // Hooks (siempre al inicio)
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const [snack, setSnack] = useState({ visible: false, text: '' });

  // Crear
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ nombre: '', stock: '' });

  // Editar (renombrar / fijar stock)
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', stock: '' });

  // Incremento (+/-)
  const [incOpen, setIncOpen] = useState(false);
  const [incForm, setIncForm] = useState({ delta: '' });

  // Ver detalle
  const [viewOpen, setViewOpen] = useState(false);

  const showSnack = t => setSnack({ visible: true, text: t });

  // Auth + snapshot
  useEffect(() => {
    let unsub;
    const unsubAuth = onAuthStateChanged(auth, u => {
      if (!u) {
        setLoading(false);
        return;
      }
      const qInv = fsQuery(collection(db, 'inventarios'), orderBy('nombre'));
      unsub = onSnapshot(
        qInv,
        snap => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setItems(list);
          setLoading(false);

          const lows = list.filter(x => Number(x.stock || 0) <= LOW_STOCK);
          if (lows.length > 0)
            showSnack(
              `⚠️ Hay ${lows.length} medicamento(s) con stock ≤ ${LOW_STOCK}.`,
            );
        },
        err => {
          console.log('inventarios onSnapshot error:', err);
          setLoading(false);
          showSnack(err.code || 'Error');
        },
      );
    });

    return () => {
      unsubAuth && unsubAuth();
      unsub && unsub();
    };
  }, []);

  // Filtro
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(x =>
      [
        x.nombre,
        String(x.stock ?? ''),
        String(x.consumido ?? ''),
        fmtDate(x.createdAt),
      ]
        .join(' ')
        .toLowerCase()
        .includes(s),
    );
  }, [items, q]);

  // ========= Acciones =========
  const createItem = async () => {
    const nombre = addForm.nombre.trim();
    const stock = Number(addForm.stock);
    if (!nombre) return showSnack('El nombre es obligatorio.');
    if (!Number.isFinite(stock) || stock < 0)
      return showSnack('Stock inválido.');

    const id = slug(nombre);
    const ref = doc(db, 'inventarios', id);
    const now = serverTimestamp();

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        // Si ya existe, sumamos stock pero NO tocamos consumido
        await updateDoc(ref, { stock: increment(stock), updatedAt: now });
        showSnack('Stock actualizado (sumado).');
      } else {
        // Nuevo doc con consumido = 0
        await setDoc(ref, {
          nombre,
          stock,
          consumido: 0,
          createdAt: now,
          updatedAt: now,
        });
        showSnack('Inventario creado.');
      }
      setAddOpen(false);
      setAddForm({ nombre: '', stock: '' });
    } catch (e) {
      console.log('createItem error:', e);
      showSnack(e.code || e.message);
    }
  };

  const openEdit = row => {
    setCurrent(row);
    setEditForm({ nombre: row.nombre || '', stock: String(row.stock ?? 0) });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!current) return;
    const newName = editForm.nombre.trim();
    const newStock = Number(editForm.stock);
    if (!newName) return showSnack('El nombre es obligatorio.');
    if (!Number.isFinite(newStock) || newStock < 0)
      return showSnack('Stock inválido.');

    const now = serverTimestamp();
    const sameName = slug(newName) === current.id;

    try {
      if (sameName) {
        // si el stock BAJA, lo consideramos consumo y lo sumamos en `consumido`
        const oldStock = Number(current.stock || 0);
        const baja = oldStock - newStock;
        const extra = baja > 0 ? { consumido: increment(baja) } : {};

        await updateDoc(doc(db, 'inventarios', current.id), {
          nombre: newName,
          stock: newStock,
          ...extra,
          updatedAt: now,
        });
      } else {
        // renombrar: conservar consumido y fechas
        const newId = slug(newName);
        await setDoc(doc(db, 'inventarios', newId), {
          nombre: newName,
          stock: newStock,
          consumido:
            Number(current.consumido || 0) +
            Math.max(Number(current.stock || 0) - newStock, 0),
          createdAt: current.createdAt || now,
          updatedAt: now,
        });
        await deleteDoc(doc(db, 'inventarios', current.id));
      }
      showSnack('Inventario actualizado.');
      setEditOpen(false);
      setCurrent(null);
    } catch (e) {
      console.log('saveEdit error:', e);
      showSnack(e.code || e.message);
    }
  };

  const openIncrement = row => {
    setCurrent(row);
    setIncForm({ delta: '' });
    setIncOpen(true);
  };

  const applyIncrement = async () => {
    if (!current) return;
    const delta = Number(incForm.delta);
    if (!Number.isFinite(delta) || delta === 0)
      return showSnack('Cantidad inválida (usa +5 o -3).');

    try {
      // si delta es negativo, lo sumamos al consumido
      const updates = {
        stock: increment(delta),
        updatedAt: serverTimestamp(),
      };
      if (delta < 0) updates.consumido = increment(Math.abs(delta));

      await updateDoc(doc(db, 'inventarios', current.id), updates);

      showSnack(
        delta > 0
          ? `Se agregaron +${delta}.`
          : `Se descontaron ${Math.abs(delta)} (consumido).`,
      );
      setIncOpen(false);
      setCurrent(null);
    } catch (e) {
      console.log('applyIncrement error:', e);
      showSnack(e.code || e.message);
    }
  };

  const remove = row => {
    Alert.alert('Eliminar', `¿Borrar inventario de “${row.nombre}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'inventarios', row.id));
            showSnack('Inventario eliminado.');
          } catch (e) {
            console.log('delete inv error:', e);
            showSnack(e.code || e.message);
          }
        },
      },
    ]);
  };

  const Separator = () => <Divider />;

  // ========== Render ==========
  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content
          title="Inventario"
          subtitle="Control de stock y consumo"
        />
        <Appbar.Action icon="plus" onPress={() => setAddOpen(true)} />
      </Appbar.Header>

      <View style={styles.container}>
        <Searchbar
          placeholder="Buscar por nombre, stock, consumido o fecha…"
          value={q}
          onChangeText={setQ}
          style={{ marginBottom: 10 }}
        />

        <Card style={styles.card} mode="elevated">
          <Card.Content style={{ paddingTop: 0 }}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8, color: '#6B7C87' }}>
                  Cargando…
                </Text>
              </View>
            ) : (
              <View style={{ height: 520 }}>
                <FlatList
                  data={filtered}
                  keyExtractor={it => it.id}
                  ItemSeparatorComponent={Separator}
                  ListEmptyComponent={
                    <View style={{ paddingVertical: 16 }}>
                      <Text style={{ color: '#6B7C87' }}>Sin resultados</Text>
                    </View>
                  }
                  renderItem={({ item: row }) => {
                    const low = Number(row.stock || 0) <= LOW_STOCK;
                    const created = fmtDate(row.createdAt) || '—';
                    const consumido = Number(row.consumido || 0);

                    return (
                      <List.Item
                        onPress={() => {
                          setCurrent(row);
                          setViewOpen(true);
                        }}
                        title={row.nombre}
                        titleStyle={[
                          styles.itemTitle,
                          low && { color: '#B71C1C' },
                        ]}
                        description={() => (
                          <View style={{ gap: 2 }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Text style={styles.descText}>
                                Stock: {row.stock ?? 0}
                              </Text>
                              {low && (
                                <Chip
                                  compact
                                  selected
                                  color="#fff"
                                  style={styles.lowChip}
                                  textStyle={{ color: '#fff' }}
                                >
                                  Bajo stock
                                </Chip>
                              )}
                            </View>

                            <Text style={styles.descText}>
                              Consumido: {consumido}
                            </Text>

                            <Text
                              style={[styles.descText, { fontStyle: 'italic' }]}
                            >
                              Fecha de registro: {created}
                            </Text>
                          </View>
                        )}
                        left={() => (
                          <View
                            style={{
                              justifyContent: 'center',
                              alignItems: 'center',
                              width: 40,
                            }}
                          >
                            <Icon
                              name="pill"
                              size={24}
                              color={low ? '#B71C1C' : '#1565C0'}
                            />
                          </View>
                        )}
                        right={() => (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                          >
                            <IconButton
                              icon="plus-circle"
                              onPress={() => openIncrement(row)}
                            />
                            <IconButton
                              icon="pencil"
                              onPress={() => openEdit(row)}
                            />
                            <IconButton
                              icon="delete"
                              onPress={() => remove(row)}
                            />
                          </View>
                        )}
                      />
                    );
                  }}
                />
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      <FAB style={styles.fab} icon="plus" onPress={() => setAddOpen(true)} />

      {/* Modal: crear inventario */}
      <Portal>
        <Modal
          visible={addOpen}
          onDismiss={() => setAddOpen(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleMedium" style={{ marginBottom: 12 }}>
            Nuevo inventario
          </Text>
          <TextInput
            label="Nombre *"
            value={addForm.nombre}
            onChangeText={v => setAddForm(s => ({ ...s, nombre: v }))}
            style={styles.input}
          />
          <TextInput
            label="Stock inicial *"
            value={addForm.stock}
            onChangeText={v => setAddForm(s => ({ ...s, stock: v }))}
            keyboardType="numeric"
            style={styles.input}
          />
          <View
            style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}
          >
            <Button onPress={() => setAddOpen(false)}>Cancelar</Button>
            <Button mode="contained" onPress={createItem}>
              Crear
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Modal: editar inventario */}
      <Portal>
        <Modal
          visible={editOpen}
          onDismiss={() => setEditOpen(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleMedium" style={{ marginBottom: 12 }}>
            Editar inventario
          </Text>
          <TextInput
            label="Nombre *"
            value={editForm.nombre}
            onChangeText={v => setEditForm(s => ({ ...s, nombre: v }))}
            style={styles.input}
          />
          <TextInput
            label="Stock (valor final) *"
            value={editForm.stock}
            onChangeText={v => setEditForm(s => ({ ...s, stock: v }))}
            keyboardType="numeric"
            style={styles.input}
          />
          <View
            style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}
          >
            <Button onPress={() => setEditOpen(false)}>Cancelar</Button>
            <Button mode="contained" onPress={saveEdit}>
              Guardar
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Modal: agregar/descontar unidades */}
      <Portal>
        <Modal
          visible={incOpen}
          onDismiss={() => setIncOpen(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleMedium" style={{ marginBottom: 12 }}>
            Agregar / Descontar unidades
          </Text>
          <Text style={{ marginBottom: 6 }}>
            Medicamento:{' '}
            <Text style={{ fontWeight: '700' }}>{current?.nombre || '—'}</Text>
          </Text>
          <TextInput
            label="Cantidad (ej. +5 o -3) *"
            value={incForm.delta}
            onChangeText={v => setIncForm({ delta: v })}
            keyboardType="numeric"
            style={styles.input}
          />
          <View
            style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}
          >
            <Button onPress={() => setIncOpen(false)}>Cancelar</Button>
            <Button mode="contained" onPress={applyIncrement}>
              Aplicar
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Modal: VER DETALLE */}
      <Portal>
        <Modal
          visible={viewOpen}
          onDismiss={() => setViewOpen(false)}
          contentContainerStyle={styles.modal}
        >
          <ScrollView>
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>
              Detalle del inventario
            </Text>
            <Text>
              Nombre: <Text style={styles.bold}>{current?.nombre ?? '—'}</Text>
            </Text>
            <Text>
              Stock: <Text style={styles.bold}>{current?.stock ?? 0}</Text>
            </Text>
            <Text>
              Consumido:{' '}
              <Text style={styles.bold}>{Number(current?.consumido || 0)}</Text>
            </Text>
            <Text>
              Fecha de registro:{' '}
              <Text style={styles.bold}>
                {fmtDate(current?.createdAt) || '—'}
              </Text>
            </Text>
            <Text>
              Última actualización:{' '}
              <Text style={styles.bold}>
                {fmtDate(current?.updatedAt) || '—'}
              </Text>
            </Text>
            <Text>
              ID (doc): <Text style={styles.mono}>{current?.id || '—'}</Text>
            </Text>
            <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
              <Button onPress={() => setViewOpen(false)}>Cerrar</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      <Snackbar
        visible={snack.visible}
        onDismiss={() => setSnack({ visible: false, text: '' })}
        duration={2500}
      >
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

  itemTitle: { fontWeight: '700', fontSize: 16, color: '#0F172A' },
  descText: { color: '#607D8B' },
  lowChip: { backgroundColor: '#D32F2F' },

  modal: {
    margin: 16,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    maxHeight: '90%',
  },
  input: { marginBottom: 10 },

  bold: { fontWeight: '700' },
  mono: { fontFamily: 'monospace' },
});

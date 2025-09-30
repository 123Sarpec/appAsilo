// vistas/PacienteAgregar.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import {
  Appbar,
  Searchbar,
  Card,
  Text,
  TextInput,
  Button,
  IconButton,
  Portal,
  Modal,
  FAB,
  Snackbar,
  Avatar,
  Divider,
  Chip,
  ActivityIndicator,
  TouchableRipple,
} from 'react-native-paper';
import { FlatList } from 'react-native';

// Firebase
import { db, auth } from '../firebase';
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query as fsQuery,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const COL_PACIENTES = 'pacientes';
const COL_MEDICOS = 'medicos';

// Helpers
const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';

const fmtDate = (ts) => {
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

export default function PacienteAgregar() {
  // ===== State =====
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [medicos, setMedicos] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [currentId, setCurrentId] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [snack, setSnack] = useState({ visible: false, text: '' });
  const [actionRowId, setActionRowId] = useState(null);

  const [form, setForm] = useState({
    // Ficha inicial
    nombreCompleto: '',
    fechaNacimiento: '',
    dpi: '',
    lugarNacimiento: '',
    fechaIngreso: '',
    personaIngresa: '',
    parentesco: '',
    emergenciaNombre: '',
    emergenciaTelefono: '',
    // Ficha médica
    peso: '',
    estatura: '',
    enfermedades: '',
    alergias: '',
    estadoFisico: '',
    fechaFallecimiento: '',
    causaFallecimiento: '',
    // Enfermera/médico
    enfermeraId: '',
    enfermeraNombre: '',
  });

  // ===== Auth + suscripciones =====
  useEffect(() => {
    let unsubPac, unsubMed;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        console.log('⚠️ No hay usuario autenticado.');
        setLoading(false);
        return;
      }

      // Pacientes
      const qPac = fsQuery(collection(db, COL_PACIENTES), orderBy('createdAt', 'desc'));
      unsubPac = onSnapshot(
        qPac,
        (snap) => {
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => {
          console.log('❌ onSnapshot pacientes:', err);
          setSnack({ visible: true, text: err.code || 'Error' });
          setLoading(false);
        }
      );

      // Médicos (para picker)
      const qMed = fsQuery(collection(db, COL_MEDICOS), orderBy('nombre'));
      unsubMed = onSnapshot(qMed, (snap) =>
        setMedicos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      );
    });

    return () => {
      unsubAuth && unsubAuth();
      unsubPac && unsubPac();
      unsubMed && unsubMed();
    };
  }, []);

  // ===== Helpers =====
  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const showSnack = (t) => setSnack({ visible: true, text: t });
  const openView = (row) => { setViewRow(row); setViewOpen(true); };

  // Abrir crear / editar
  const openCreate = () => {
    setMode('create');
    setCurrentId(null);
    setForm((s) => ({
      ...s,
      nombreCompleto: '',
      fechaNacimiento: '',
      dpi: '',
      lugarNacimiento: '',
      fechaIngreso: new Date().toISOString().split('T')[0],
      personaIngresa: '',
      parentesco: '',
      emergenciaNombre: '',
      emergenciaTelefono: '',
      peso: '',
      estatura: '',
      enfermedades: '',
      alergias: '',
      estadoFisico: '',
      fechaFallecimiento: '',
      causaFallecimiento: '',
      enfermeraId: '',
      enfermeraNombre: '',
    }));
    setVisible(true);
  };

  const openEdit = (row) => {
    setMode('edit');
    setCurrentId(row.id);
    setForm({
      nombreCompleto: row.nombreCompleto ?? '',
      fechaNacimiento: row.fechaNacimiento ?? '',
      dpi: row.dpi ?? '',
      lugarNacimiento: row.lugarNacimiento ?? '',
      fechaIngreso: row.fechaIngreso || fmtDate(row.createdAt) || '',
      personaIngresa: row.personaIngresa ?? '',
      parentesco: row.parentesco ?? '',
      emergenciaNombre: row.emergenciaNombre ?? '',
      emergenciaTelefono: row.emergenciaTelefono ?? '',
      peso: String(row.peso ?? ''),
      estatura: String(row.estatura ?? ''),
      enfermedades: row.enfermedades ?? '',
      alergias: row.alergias ?? '',
      estadoFisico: row.estadoFisico ?? '',
      fechaFallecimiento: row.fechaFallecimiento ?? '',
      causaFallecimiento: row.causaFallecimiento ?? '',
      enfermeraId: row.enfermeraId ?? '',
      enfermeraNombre: row.enfermeraNombre ?? '',
    });
    setVisible(true);
  };

  // Guardar / actualizar
  const save = async () => {
    if (!form.nombreCompleto.trim()) return showSnack('El nombre completo es obligatorio.');
    if (!form.fechaIngreso) return showSnack('La fecha de ingreso es obligatoria.');

    const base = {
      ...form,
      // Normaliza tipos
      peso: form.peso !== '' ? Number(form.peso) : '',
      estatura: form.estatura !== '' ? Number(form.estatura) : '',
      fechaIngreso: String(form.fechaIngreso || ''),
    };

    try {
      if (mode === 'create') {
        await addDoc(collection(db, COL_PACIENTES), { ...base, createdAt: serverTimestamp() });
        showSnack('Paciente agregado.');
      } else {
        await updateDoc(doc(db, COL_PACIENTES, currentId), { ...base, updatedAt: serverTimestamp() });
        showSnack('Paciente actualizado.');
      }
      setVisible(false);
      setActionRowId(null);
    } catch (e) {
      console.log('❌ save paciente:', e);
      showSnack(`Error: ${e.code || ''} ${e.message || ''}`.trim());
    }
  };

  // Eliminar
  const remove = (row) => {
    Alert.alert('Eliminar', `¿Borrar a “${row.nombreCompleto}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, COL_PACIENTES, row.id));
            showSnack('Paciente eliminado.');
            setActionRowId(null);
          } catch (e) {
            console.log('❌ delete paciente:', e);
            showSnack('No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  // Filtros
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) =>
      [x.nombreCompleto, x.enfermedades, x.fechaIngreso || fmtDate(x.createdAt), x.enfermeraNombre, x.dpi]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  const medicosFiltrados = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return medicos;
    return medicos.filter((m) => [m.nombre, m.telefono, m.cui].join(' ').toLowerCase().includes(q));
  }, [medicos, pickerSearch]);

  const Separator = () => <Divider />;

  // ===== UI =====
  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title="Pacientes" subtitle="Conectado a Firestore" />
        <Appbar.Action icon="plus" onPress={openCreate} />
      </Appbar.Header>

      <View style={styles.container}>
        <Searchbar
          placeholder="Buscar por nombre, fecha o enfermedad…"
          value={query}
          onChangeText={setQuery}
          style={{ marginBottom: 10 }}
        />

        <Card style={styles.card}>
          <Card.Content style={{ paddingTop: 0 }}>
            {loading ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator />
                <Text style={{ color: '#6B7C87', marginTop: 6 }}>Cargando…</Text>
              </View>
            ) : (
              // 🔧 Altura garantizada para que la FlatList siempre se vea dentro de tabs
              <View style={{ height: 520 }}>
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  ItemSeparatorComponent={Separator}
                  ListEmptyComponent={
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                      <Text style={{ color: '#6B7C87' }}>Sin resultados</Text>
                    </View>
                  }
                  renderItem={({ item: row, index }) => {
                    const active = actionRowId === row.id;
                    return (
                      <View key={row.id}>
                        <TouchableRipple rippleColor="rgba(0,0,0,0.08)" onPress={() => setActionRowId(active ? null : row.id)}>
                          <View style={[styles.mailItem, active && styles.mailItemActive]}>
                            <Avatar.Text
                              size={40}
                              label={initials(row.nombreCompleto)}
                              style={styles.avatar}
                              color="#0F172A"
                              onTouchEnd={() => openView(row)}
                            />
                            <View style={styles.mailBody}>
                              <View style={styles.mailHeader}>
                                <Text numberOfLines={1} style={styles.mailTitle}>
                                  {row.nombreCompleto}
                                </Text>
                                <Text style={styles.mailDate}>
                                  {row.fechaIngreso || fmtDate(row.createdAt) || '—'}
                                </Text>
                              </View>
                              <View style={styles.mailSubtitle}>
                                {row.enfermedades ? (
                                  <Chip compact>{row.enfermedades}</Chip>
                                ) : (
                                  <Text style={{ color: '#94A3B8' }}>Sin enfermedad registrada</Text>
                                )}
                              </View>
                            </View>
                            <View style={styles.mailActions}>
                              {active ? (
                                <>
                                  <IconButton icon="pencil" onPress={() => openEdit(row)} />
                                  <IconButton icon="delete" onPress={() => remove(row)} />
                                </>
                              ) : (
                                <IconButton icon="chevron-right" onPress={() => openView(row)} />
                              )}
                            </View>
                          </View>
                        </TouchableRipple>
                        {index < filtered.length - 1 && <Divider />}
                      </View>
                    );
                  }}
                />
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      <FAB style={styles.fab} icon="plus" onPress={openCreate} />

      {/* ==== MODAL: CREAR/EDITAR ==== */}
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            <Text variant="titleMedium" style={{ marginBottom: 8 }}>
              {mode === 'create' ? 'Agregar paciente' : 'Editar paciente'}
            </Text>

            {/* FICHA INICIAL */}
            <Text style={styles.section}>FICHA INICIAL</Text>
            <TextInput label="Nombre completo *" value={form.nombreCompleto} onChangeText={(v) => onChange('nombreCompleto', v)} style={styles.input} />
            <TextInput label="Fecha de nacimiento (YYYY-MM-DD)" value={form.fechaNacimiento} onChangeText={(v) => onChange('fechaNacimiento', v)} style={styles.input} />
            <TextInput label="DPI" value={form.dpi} onChangeText={(v) => onChange('dpi', v)} keyboardType="numeric" style={styles.input} />
            <TextInput label="Lugar de nacimiento" value={form.lugarNacimiento} onChangeText={(v) => onChange('lugarNacimiento', v)} style={styles.input} />
            <TextInput label="Fecha de ingreso * (YYYY-MM-DD)" value={form.fechaIngreso} onChangeText={(v) => onChange('fechaIngreso', v)} style={styles.input} />
            <TextInput label="Persona que ingresa" value={form.personaIngresa} onChangeText={(v) => onChange('personaIngresa', v)} style={styles.input} />
            <TextInput label="Parentesco" value={form.parentesco} onChangeText={(v) => onChange('parentesco', v)} style={styles.input} />
            <TextInput label="Emergencia: Nombre" value={form.emergenciaNombre} onChangeText={(v) => onChange('emergenciaNombre', v)} style={styles.input} />
            <TextInput label="Emergencia: Teléfono" value={form.emergenciaTelefono} onChangeText={(v) => onChange('emergenciaTelefono', v)} keyboardType="phone-pad" style={styles.input} />

            {/* Selector enfermera/médico */}
            <TextInput
              label="Enfermera que realiza el ingreso (seleccione)"
              value={form.enfermeraNombre}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => setPickerOpen(true)} />}
              style={styles.input}
            />

            {/* FICHA MÉDICA */}
            <Text style={styles.section}>FICHA MÉDICA</Text>
            <TextInput label="Peso (lb/kg)" value={form.peso} onChangeText={(v) => onChange('peso', v)} keyboardType="numeric" style={styles.input} />
            <TextInput label="Estatura" value={form.estatura} onChangeText={(v) => onChange('estatura', v)} keyboardType="numeric" style={styles.input} />
            <TextInput label="Enfermedades" value={form.enfermedades} onChangeText={(v) => onChange('enfermedades', v)} style={styles.input} />
            <TextInput label="Alergias" value={form.alergias} onChangeText={(v) => onChange('alergias', v)} style={styles.input} />
            <TextInput label="Estado físico del ingresado" value={form.estadoFisico} onChangeText={(v) => onChange('estadoFisico', v)} multiline style={styles.input} />
            <TextInput label="Fecha de fallecimiento (opcional)" value={form.fechaFallecimiento} onChangeText={(v) => onChange('fechaFallecimiento', v)} style={styles.input} />
            <TextInput label="Causa (opcional)" value={form.causaFallecimiento} onChangeText={(v) => onChange('causaFallecimiento', v)} style={styles.input} />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8, marginBottom: 6 }}>
              <Button mode="text" onPress={() => setVisible(false)}>Cancelar</Button>
              <Button mode="contained" onPress={save}>{mode === 'create' ? 'Guardar' : 'Actualizar'}</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* ==== MODAL: PICKER MÉDICOS ==== */}
      <Portal>
        <Modal visible={pickerOpen} onDismiss={() => setPickerOpen(false)} contentContainerStyle={styles.pickerModal}>
          <Text variant="titleMedium" style={{ marginBottom: 8 }}>Seleccionar enfermera/médico</Text>
          <Searchbar placeholder="Buscar…" value={pickerSearch} onChangeText={setPickerSearch} style={{ marginBottom: 8 }} />
          <Card>
            <Card.Content style={{ paddingTop: 0 }}>
              {medicosFiltrados.length === 0 ? (
                <Text style={{ color: '#6B7C87', marginVertical: 8 }}>No hay médicos registrados.</Text>
              ) : (
                medicosFiltrados.map((m, i) => (
                  <View key={m.id ?? i}>
                    <TouchableRipple
                      onPress={() => {
                        onChange('enfermeraId', m.id ?? '');
                        onChange('enfermeraNombre', m.nombre ?? '');
                        setPickerOpen(false);
                      }}
                    >
                      <View style={styles.pickerItem}>
                        <Avatar.Text size={32} label={initials(m.nombre)} style={{ marginRight: 10, backgroundColor: '#E2E8F0' }} color="#0F172A" />
                        <Text style={{ flex: 1 }}>{m.nombre}</Text>
                        {m.telefono ? <Chip compact>Tel: {m.telefono}</Chip> : null}
                      </View>
                    </TouchableRipple>
                    {i < medicosFiltrados.length - 1 && <Divider />}
                  </View>
                ))
              )}
            </Card.Content>
          </Card>
          <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
            <Button onPress={() => setPickerOpen(false)}>Cerrar</Button>
          </View>
        </Modal>
      </Portal>

      {/* ==== MODAL: VER DETALLE ==== */}
      <Portal>
        <Modal visible={viewOpen} onDismiss={() => setViewOpen(false)} contentContainerStyle={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>Detalle del paciente</Text>

            <Text style={styles.section}>FICHA INICIAL</Text>
            <Detail label="Nombre completo" value={viewRow?.nombreCompleto} />
            <Detail label="Fecha de nacimiento" value={viewRow?.fechaNacimiento} />
            <Detail label="DPI" value={viewRow?.dpi} />
            <Detail label="Lugar de nacimiento" value={viewRow?.lugarNacimiento} />
            <Detail label="Fecha de ingreso" value={viewRow?.fechaIngreso || fmtDate(viewRow?.createdAt)} />
            <Detail label="Persona que ingresa" value={viewRow?.personaIngresa} />
            <Detail label="Parentesco" value={viewRow?.parentesco} />
            <Detail label="En emergencia (Nombre)" value={viewRow?.emergenciaNombre} />
            <Detail label="En emergencia (Teléfono)" value={viewRow?.emergenciaTelefono} />
            <Detail label="Enfermera que realiza el ingreso" value={viewRow?.enfermeraNombre} />

            <Text style={styles.section}>FICHA MÉDICA</Text>
            <Detail label="Peso" value={String(viewRow?.peso ?? '')} />
            <Detail label="Estatura" value={String(viewRow?.estatura ?? '')} />
            <Detail label="Enfermedades" value={viewRow?.enfermedades} />
            <Detail label="Alergias" value={viewRow?.alergias} />
            <Detail label="Estado físico del ingresado" value={viewRow?.estadoFisico} />
            <Detail label="Fecha de fallecimiento" value={viewRow?.fechaFallecimiento} />
            <Detail label="Causa" value={viewRow?.causaFallecimiento} />

            <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
              <Button onPress={() => setViewOpen(false)}>Cerrar</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      <Snackbar visible={snack.visible} onDismiss={() => setSnack({ visible: false, text: '' })} duration={2500}>
        {snack.text}
      </Snackbar>
    </View>
  );
}

function Detail({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={styles.detailValue}>{value ? String(value) : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  card: { borderRadius: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },

  // lista estilo "correo"
  mailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  mailItemActive: { backgroundColor: '#EEF2FF' },
  avatar: { backgroundColor: '#E2E8F0', marginRight: 12 },
  mailBody: { flex: 1 },
  mailHeader: { flexDirection: 'row', alignItems: 'center' },
  mailTitle: { flex: 1, fontWeight: '600', fontSize: 16, color: '#0F172A' },
  mailDate: { marginLeft: 8, color: '#64748B', fontSize: 12 },
  mailSubtitle: { marginTop: 2, flexDirection: 'row', alignItems: 'center' },
  mailActions: { flexDirection: 'row', marginLeft: 6 },

  // Modales / picker
  modal: { margin: 16, backgroundColor: 'white', padding: 16, borderRadius: 16, maxHeight: '90%' },
  pickerModal: { margin: 16, backgroundColor: 'white', padding: 16, borderRadius: 16, maxHeight: '80%' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },

  section: { marginTop: 10, marginBottom: 6, fontWeight: '700' },
  input: { marginBottom: 10 },

  // Detalle
  detailRow: { flexDirection: 'row', marginBottom: 6 },
  detailLabel: { width: 200, color: '#6B7C87' },
  detailValue: { flex: 1, fontWeight: '500' },
});

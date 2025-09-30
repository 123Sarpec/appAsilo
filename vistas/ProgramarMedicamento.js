// vistas/ProgramarMedicamento.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Appbar, Card, Text, Searchbar, Button, IconButton, TextInput,
  Portal, Modal, Snackbar, Divider, ActivityIndicator, RadioButton,
  List, Chip
} from 'react-native-paper';
import { FlatList } from 'react-native';

// Firebase
import { db, auth } from '../firebase';
import {
  collection, onSnapshot, orderBy, query as fsQuery, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, runTransaction
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Notifee
import notifee, {
  AndroidImportance,
  RepeatFrequency,
  TriggerType,
} from '@notifee/react-native';

/* ========= Helpers ========= */
const fmtDateTime = (v) => {
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return '—'; }
};
const toISODateTimeLocal = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const parseISOToDate = (val) => new Date(val);
const hmToDateNext = (hhmm) => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  const now = new Date();
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(h || 0, m || 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
};
const nextWeekdayAt = (weekday, hhmm) => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  const now = new Date();
  const result = new Date(now);
  result.setSeconds(0, 0);
  result.setHours(h || 0, m || 0, 0, 0);
  const delta = ((weekday - result.getDay()) + 7) % 7;
  if (delta === 0 && result <= now) result.setDate(result.getDate() + 7);
  else result.setDate(result.getDate() + delta);
  return result;
};
const slug = (s = '') =>
  s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const C = {
  medicos: 'medicos',
  pacientes: 'pacientes',
  medicamentos: 'medicamentos',
  programaciones: 'programaciones',
  inventarios: 'inventarios',
};

/* ========= Notificaciones ========= */
async function ensureHeadsUpChannel() {
  await notifee.requestPermission();
  await notifee.createChannel({
    id: 'meds',
    name: 'Recordatorios de medicamentos',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    lights: true,
    badge: true,
  });
}

const schedulePairOnce = async ({ title, body, when, payload }) => {
  await ensureHeadsUpChannel();
  const ids = [];
  // Pre-aviso (1 min antes), solo si aplica
  const pre = new Date(when.getTime() - 60 * 1000);
  if (pre > new Date()) {
    const preId = await notifee.createTriggerNotification(
      {
        title: `En 1 min: ${title}`,
        body,
        android: { channelId: 'meds', pressAction: { id: 'default' }, smallIcon: 'ic_launcher', color: '#1565C0' },
        data: payload || {},
      },
      { type: TriggerType.TIMESTAMP, timestamp: pre.getTime(), alarmManager: true }
    );
    ids.push(preId);
  }

  // Aviso principal
  const id = await notifee.createTriggerNotification(
    {
      title,
      body,
      android: { channelId: 'meds', pressAction: { id: 'default' }, smallIcon: 'ic_launcher', color: '#1565C0' },
      data: payload || {},
    },
    { type: TriggerType.TIMESTAMP, timestamp: when.getTime(), alarmManager: true }
  );
  ids.push(id);
  return ids;
};

// Programa múltiples ocurrencias de "cada X horas" para los próximos N días
async function scheduleCadaXHours({ title, body, start, horas = 8, diasHorizonte = 30, payload }) {
  const ids = [];
  const ms = Math.max(1, Number(horas || 8)) * 60 * 60 * 1000;
  const horizon = Number(diasHorizonte || 30) * 24 * 60 * 60 * 1000;

  // Alinear desde la hora de inicio
  let t = new Date(start);
  if (t < new Date()) {
    // si el inicio quedó en el pasado, salta al siguiente múltiplo
    const diff = new Date() - t;
    const steps = Math.floor(diff / ms) + 1;
    t = new Date(t.getTime() + steps * ms);
  }

  // Genera ocurrencias dentro del horizonte
  const end = new Date(t.getTime() + horizon);
  while (t <= end) {
    const pairIds = await schedulePairOnce({ title, body, when: t, payload });
    ids.push(...pairIds);
    t = new Date(t.getTime() + ms);
  }
  return ids;
}

const programarNotifs = async (data) => {
  const { medicoNombre, pacienteNombre, medicamentoNombre, tipo, cantidadPorToma, inicio, diasSemana, horaSemanal, times, intervaloHoras } = data;
  const baseTitle = `Tomar: ${medicamentoNombre}`;
  const baseBody = `Paciente: ${pacienteNombre} · Asignó: Dr(a). ${medicoNombre} · Cant.: ${cantidadPorToma}`;
  const payload = { medicamentoNombre, cantidadPorToma: String(cantidadPorToma || 0) };

  const ids = [];

  if (tipo === 'unico') {
    const when = parseISOToDate(inicio);
    ids.push(...await schedulePairOnce({ title: baseTitle, body: baseBody, when, payload }));
    return ids;
  }

  if (tipo === 'cadax') {
    const start = parseISOToDate(inicio);
    // Programa todas las dosis por 30 días desde la hora de inicio
    const extra = await scheduleCadaXHours({
      title: baseTitle,
      body: baseBody,
      start,
      horas: Number(intervaloHoras || 8),
      diasHorizonte: 30,
      payload,
    });
    ids.push(...extra);
    return ids;
  }

  if (tipo === 'semanal') {
    for (const d of diasSemana || []) {
      const first = nextWeekdayAt(Number(d), horaSemanal);
      // par inicial
      ids.push(...await schedulePairOnce({ title: baseTitle, body: baseBody, when: first, payload }));
      // repetición semanal
      const id = await notifee.createTriggerNotification(
        { title: baseTitle, body: baseBody, android: { channelId: 'meds', pressAction: { id: 'default' } }, data: payload },
        { type: TriggerType.TIMESTAMP, timestamp: first.getTime(), repeatFrequency: RepeatFrequency.WEEKLY, alarmManager: true }
      );
      ids.push(id);
    }
    return ids;
  }

  if (tipo === 'postcomida') {
    const t = times || {};
    const entries = Object.entries(t).filter(([, v]) => !!v);
    for (const [label, hhmm] of entries) {
      const first = hmToDateNext(hhmm);
      ids.push(...await schedulePairOnce({ title: `${baseTitle} (${label})`, body: baseBody, when: first, payload }));
      const id = await notifee.createTriggerNotification(
        { title: `${baseTitle} (${label})`, body: baseBody, android: { channelId: 'meds', pressAction: { id: 'default' } }, data: payload },
        { type: TriggerType.TIMESTAMP, timestamp: first.getTime(), repeatFrequency: RepeatFrequency.DAILY, alarmManager: true }
      );
      ids.push(id);
    }
    return ids;
  }

  return ids;
};

const cancelarNotifs = async (notifIds = []) => {
  try { await notifee.cancelTriggerNotifications(notifIds); }
  catch (e) { console.log('cancel notifee error', e); }
};

/* ========= Inventario (Transacción) ========= */
async function descontarInventarioTx(inventarioId, cantidad) {
  if (!inventarioId || !cantidad) return;
  const ref = doc(db, C.inventarios, inventarioId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Inventario no encontrado');
    const data = snap.data();
    const stock = Number(data.stock || 0);
    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Cantidad inválida');

    if (stock < qty) throw new Error(`Stock insuficiente (${stock} disponibles)`);

    tx.update(ref, {
      stock: stock - qty,
      consumido: Number(data.consumido || 0) + qty,
      updatedAt: serverTimestamp(),
    });
  });
}

/* ========= Pantalla ========= */
export default function ProgramarMedicamento() {
  const [loading, setLoading] = useState(true);
  const [medicos, setMedicos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [items, setItems] = useState([]);

  const [q, setQ] = useState('');

  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('create');
  const [currentId, setCurrentId] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [snack, setSnack] = useState({ visible: false, text: '' });

  const [form, setForm] = useState({
    medicoId: '', medicoNombre: '',
    pacienteId: '', pacienteNombre: '',
    medicamentoId: '', medicamentoNombre: '',
    inventarioId: '',
    cantidadPorToma: '',
    tipo: 'unico',            // unico | cadax | semanal | postcomida
    intervaloHoras: '8',      // solo para "cadax"
    inicio: toISODateTimeLocal(new Date()),
    diasSemana: [],
    horaSemanal: '08:00',
    times: { desayuno: '08:00', almuerzo: '13:00', cena: '19:00' },
    notas: '',
    notifIds: [],
    activo: true,
    estado: 'programado',
  });
  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const showSnack = (t) => setSnack({ visible: true, text: t });

  // Carga de datos
  useEffect(() => {
    let u1, u2, u3, u4;
    const stop = onAuthStateChanged(auth, (u) => {
      if (!u) { setLoading(false); return; }
      u1 = onSnapshot(fsQuery(collection(db, C.medicos), orderBy('nombre')), s => setMedicos(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      u2 = onSnapshot(fsQuery(collection(db, C.pacientes), orderBy('nombreCompleto')), s => setPacientes(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      u3 = onSnapshot(fsQuery(collection(db, C.medicamentos), orderBy('nombre')), s => setMedicamentos(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      u4 = onSnapshot(fsQuery(collection(db, C.programaciones), orderBy('createdAt', 'desc')), s => { setItems(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    });
    return () => { stop && stop(); u1&&u1(); u2&&u2(); u3&&u3(); u4&&u4(); };
  }, []);

  // Autocerrar “único” vencido
  useEffect(() => {
    const now = new Date();
    items
      .filter(x => x.tipo === 'unico' && x.activo && x.inicio && new Date(x.inicio) <= now)
      .forEach(async (row) => {
        try { await updateDoc(doc(db, C.programaciones, row.id), { activo: false, estado: 'finalizado', updatedAt: serverTimestamp() }); }
        catch {}
      });
  }, [items]);

  /* CRUD */
  const openCreate = () => {
    setMode('create'); setCurrentId(null);
    setForm(s => ({
      ...s,
      medicoId: '', medicoNombre: '',
      pacienteId: '', pacienteNombre: '',
      medicamentoId: '', medicamentoNombre: '',
      inventarioId: '',
      cantidadPorToma: '',
      tipo: 'unico',
      intervaloHoras: '8',
      inicio: toISODateTimeLocal(new Date()),
      diasSemana: [],
      horaSemanal: '08:00',
      times: { desayuno: '08:00', almuerzo: '13:00', cena: '19:00' },
      notas: '', notifIds: [], activo: true, estado: 'programado',
    }));
    setVisible(true);
  };
  const openEdit = (row) => {
    setMode('edit'); setCurrentId(row.id);
    setForm({
      medicoId: row.medicoId, medicoNombre: row.medicoNombre,
      pacienteId: row.pacienteId, pacienteNombre: row.pacienteNombre,
      medicamentoId: row.medicamentoId, medicamentoNombre: row.medicamentoNombre,
      inventarioId: row.inventarioId || slug(row.medicamentoNombre),
      cantidadPorToma: String(row.cantidadPorToma ?? ''),
      tipo: row.tipo,
      intervaloHoras: String(row.intervaloHoras || '8'),
      inicio: row.inicio || toISODateTimeLocal(new Date()),
      diasSemana: row.diasSemana || [],
      horaSemanal: row.horaSemanal ?? '08:00',
      times: row.times || { desayuno: '', almuerzo: '', cena: '' },
      notas: row.notas ?? '',
      notifIds: row.notifIds ?? [],
      activo: !!row.activo,
      estado: row.estado || (row.activo ? 'programado' : 'pausado'),
    });
    setVisible(true);
  };
  const openView = (row) => { setViewRow(row); setViewOpen(true); };

  const validate = () => {
    if (!form.medicoId) return 'Seleccione un médico.';
    if (!form.pacienteId) return 'Seleccione un paciente.';
    if (!form.medicamentoId) return 'Seleccione un medicamento.';
    if (!form.inventarioId) onChange('inventarioId', slug(form.medicamentoNombre));
    if (!form.cantidadPorToma || !/^\d+(\.\d+)?$/.test(String(form.cantidadPorToma))) return 'Indique la cantidad por toma (número).';

    if (form.tipo === 'unico' || form.tipo === 'cadax') {
      if (!form.inicio) return 'Defina fecha y hora de inicio.';
      if (form.tipo === 'cadax') {
        const h = Number(form.intervaloHoras);
        if (!Number.isFinite(h) || h <= 0) return 'Intervalo (horas) inválido.';
      }
    }
    if (form.tipo === 'semanal') {
      if (!form.diasSemana?.length) return 'Seleccione al menos un día.';
      if (!form.horaSemanal) return 'Defina la hora.';
    }
    if (form.tipo === 'postcomida') {
      const t = form.times || {}; if (!t.desayuno && !t.almuerzo && !t.cena) return 'Selecciona al menos un horario.';
    }
    return null;
  };

  const save = async () => {
    const err = validate(); if (err) return showSnack(err);
    try {
      if (mode === 'edit' && form.notifIds?.length) await cancelarNotifs(form.notifIds);

      const notifIds = await programarNotifs({
        medicoNombre: form.medicoNombre,
        pacienteNombre: form.pacienteNombre,
        medicamentoNombre: form.medicamentoNombre,
        cantidadPorToma: Number(form.cantidadPorToma),
        tipo: form.tipo,
        inicio: form.inicio,
        diasSemana: form.diasSemana,
        horaSemanal: form.horaSemanal,
        times: form.times,
        intervaloHoras: Number(form.intervaloHoras || 8),
      });

      const payload = {
        ...form,
        cantidadPorToma: Number(form.cantidadPorToma),
        intervaloHoras: Number(form.intervaloHoras || 8),
        notifIds,
        updatedAt: serverTimestamp(),
      };
      if (mode === 'create') payload.createdAt = serverTimestamp();

      // ====== Descuento SOLO al principio (una vez) ======
      if (mode === 'create') {
        await descontarInventarioTx(form.inventarioId || slug(form.medicamentoNombre), Number(form.cantidadPorToma));
      }

      if (mode === 'create') {
        await addDoc(collection(db, C.programaciones), payload);
        showSnack('Programación creada.');
      } else {
        await updateDoc(doc(db, C.programaciones, currentId), payload);
        showSnack('Programación actualizada.');
      }
      setVisible(false);
    } catch (e) {
      console.log('save programacion error:', e);
      showSnack(e.message || 'Error al guardar.');
    }
  };

  const remove = (row) => {
    Alert.alert('Eliminar', `¿Borrar programación de “${row.pacienteNombre} / ${row.medicamentoNombre}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelarNotifs(row.notifIds || []);
            await deleteDoc(doc(db, C.programaciones, row.id));
            showSnack('Programación eliminada.');
          } catch { showSnack('No se pudo eliminar.'); }
        },
      },
    ]);
  };

  const pause = async (row) => {
    try {
      await cancelarNotifs(row.notifIds || []);
      await updateDoc(doc(db, C.programaciones, row.id), { activo: false, estado: 'pausado', updatedAt: serverTimestamp() });
      showSnack('Programación pausada.');
    } catch { showSnack('No se pudo pausar.'); }
  };
  const resume = async (row) => {
    try {
      const ids = await programarNotifs(row);
      await updateDoc(doc(db, C.programaciones, row.id), { activo: true, estado: 'programado', notifIds: ids, updatedAt: serverTimestamp() });
      showSnack('Programación reanudada.');
    } catch { showSnack('No se pudo reanudar.'); }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(x =>
      [x.pacienteNombre, x.medicoNombre, x.medicamentoNombre, x.tipo, String(x.cantidadPorToma || ''), fmtDateTime(x.createdAt)]
        .join(' ').toLowerCase().includes(s)
    );
  }, [items, q]);

  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title="Programar Medicamento" subtitle="Notifica según pauta · Desc. solo al inicio" />
        <Appbar.Action icon="plus" onPress={openCreate} />
      </Appbar.Header>

      <View style={styles.container}>
        <Searchbar placeholder="Buscar por paciente/médico/medicamento…" value={q} onChangeText={setQ} style={{ marginBottom: 10 }} />

        <Card style={styles.card} mode="elevated">
          <Card.Content style={{ paddingTop: 0 }}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <Text style={{ marginTop: 6, color: '#6B7C87' }}>Cargando…</Text>
              </View>
            ) : (
              <View style={{ height: 520 }}>
                <FlatList
                  data={filtered}
                  keyExtractor={(it) => it.id}
                  ItemSeparatorComponent={() => <Divider />}
                  ListEmptyComponent={<Text style={{ color: '#6B7C87', paddingVertical: 12 }}>Sin programaciones</Text>}
                  renderItem={({ item: row }) => (
                    <List.Item
                      title={`${row.pacienteNombre} · ${row.medicamentoNombre}`}
                      description={() => (
                        <View>
                          <Text style={{ color: '#6B7C87' }}>Médico: {row.medicoNombre}</Text>
                          <Text style={{ color: '#6B7C87' }}>
                            Tipo: {row.tipo}{row.tipo === 'cadax' ? ` (${row.intervaloHoras}h)` : ''} · Cant.: {row.cantidadPorToma} · Inicio: {row.inicio ? row.inicio.replace('T', ' ') : '—'}
                          </Text>
                          <Text style={{ color: '#6B7C87' }}>
                            Estado: {row.estado || (row.activo ? 'programado' : 'pausado')}
                          </Text>
                        </View>
                      )}
                      onPress={() => openView(row)}
                      right={() => (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {row.activo ? (
                            <IconButton icon="pause-circle" onPress={() => pause(row)} />
                          ) : (
                            <IconButton icon="play-circle" onPress={() => resume(row)} />
                          )}
                          <IconButton icon="pencil" onPress={() => openEdit(row)} />
                          <IconButton icon="delete" onPress={() => remove(row)} />
                        </View>
                      )}
                    />
                  )}
                />
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      <Button style={styles.fab} icon="plus" mode="contained" onPress={openCreate}>Añadir</Button>

      {/* Modal crear/editar */}
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} dismissable contentContainerStyle={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text variant="titleMedium" style={{ marginBottom: 8 }}>
              {mode === 'create' ? 'Nueva programación' : 'Editar programación'}
            </Text>

            <AutoSelect label="Médico *" value={form.medicoNombre}
              onClear={() => onChange('medicoId','') || onChange('medicoNombre','')}
              data={medicos} getLabel={(x) => x.nombre}
              onSelect={(x) => onChange('medicoId', x.id) || onChange('medicoNombre', x.nombre)} />

            <AutoSelect label="Paciente *" value={form.pacienteNombre}
              onClear={() => onChange('pacienteId','') || onChange('pacienteNombre','')}
              data={pacientes} getLabel={(x) => x.nombreCompleto}
              onSelect={(x) => onChange('pacienteId', x.id) || onChange('pacienteNombre', x.nombreCompleto)} />

            <AutoSelect label="Medicamento *" value={form.medicamentoNombre}
              onClear={() => onChange('medicamentoId','') || onChange('medicamentoNombre','') || onChange('inventarioId','')}
              data={medicamentos} getLabel={(x) => x.nombre}
              onSelect={(x) => {
                onChange('medicamentoId', x.id);
                onChange('medicamentoNombre', x.nombre);
                onChange('inventarioId', slug(x.nombre)); // clave estable del inventario
              }} />

            <TextInput
              style={styles.input}
              label="Cantidad por toma *"
              value={String(form.cantidadPorToma)}
              onChangeText={(v) => onChange('cantidadPorToma', v.replace(',', '.'))}
              keyboardType="numeric"
            />

            <Text style={styles.section}>Tipo de programación</Text>
            <RadioRow value={form.tipo} onChange={(v) => onChange('tipo', v)} />

            {(form.tipo === 'unico' || form.tipo === 'cadax') && (
              <>
                <TextInput
                  label="Inicio * (YYYY-MM-DDTHH:mm)"
                  value={form.inicio}
                  onChangeText={(v) => onChange('inicio', v)}
                  style={styles.input}
                  placeholder="2025-09-24T21:00"
                />
                {form.tipo === 'cadax' && (
                  <TextInput
                    label="Cada X horas *"
                    value={String(form.intervaloHoras)}
                    onChangeText={(v) => onChange('intervaloHoras', v.replace(',', '.'))}
                    keyboardType="numeric"
                    style={styles.input}
                  />
                )}
              </>
            )}

            {form.tipo === 'semanal' && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: '#6B7C87' }}>Días de la semana</Text>
                <WeekdayChips selected={form.diasSemana} onToggle={(arr) => onChange('diasSemana', arr)} />
                <TextInput label="Hora (HH:mm)" value={form.horaSemanal} onChangeText={(v) => onChange('horaSemanal', v)} style={styles.input} />
              </View>
            )}

            {form.tipo === 'postcomida' && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: '#6B7C87' }}>Horarios (deja vacío para omitir)</Text>
                <TextInput label="Desayuno (HH:mm)" value={form.times.desayuno} onChangeText={(v) => onChange('times', { ...form.times, desayuno: v })} style={styles.input} />
                <TextInput label="Almuerzo (HH:mm)" value={form.times.almuerzo} onChangeText={(v) => onChange('times', { ...form.times, almuerzo: v })} style={styles.input} />
                <TextInput label="Cena (HH:mm)" value={form.times.cena} onChangeText={(v) => onChange('times', { ...form.times, cena: v })} style={styles.input} />
              </View>
            )}

            <TextInput label="Notas (opcional)" value={form.notas} onChangeText={(v) => onChange('notas', v)} style={styles.input} multiline />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#6B7C87' }}>Inventario (ID):</Text>
              <Text style={{ fontFamily: 'monospace' }}>{form.inventarioId || '—'}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Button onPress={() => setVisible(false)}>Cancelar</Button>
              <Button mode="contained" onPress={save}>{mode === 'create' ? 'Guardar' : 'Actualizar'}</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* Modal ver */}
      <Portal>
        <Modal visible={viewOpen} onDismiss={() => setViewOpen(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={{ marginBottom: 10 }}>Detalle de programación</Text>
          <Detail label="Paciente" value={viewRow?.pacienteNombre} />
          <Detail label="Medicamento" value={viewRow?.medicamentoNombre} />
          <Detail label="Médico" value={viewRow?.medicoNombre} />
          <Detail label="Cantidad" value={String(viewRow?.cantidadPorToma ?? '')} />
          <Detail label="Tipo" value={viewRow?.tipo === 'cadax' ? `cada ${viewRow?.intervaloHoras} horas` : viewRow?.tipo} />
          <Detail label="Inicio" value={viewRow?.inicio?.replace?.('T',' ') || '—'} />
          {viewRow?.tipo === 'semanal' && (<><Detail label="Días" value={(viewRow?.diasSemana || []).join(', ')} /><Detail label="Hora" value={viewRow?.horaSemanal} /></>)}
          {viewRow?.tipo === 'postcomida' && (<><Detail label="Desayuno" value={viewRow?.times?.desayuno || '—'} /><Detail label="Almuerzo" value={viewRow?.times?.almuerzo || '—'} /><Detail label="Cena" value={viewRow?.times?.cena || '—'} /></>)}
          <Detail label="Estado" value={viewRow?.estado || (viewRow?.activo ? 'programado' : 'pausado')} />
          <Detail label="Inventario ID" value={viewRow?.inventarioId || slug(viewRow?.medicamentoNombre || '')} />
          <Detail label="Notas" value={viewRow?.notas} />
          <Detail label="Creado" value={fmtDateTime(viewRow?.createdAt)} />
          <Detail label="Actualizado" value={fmtDateTime(viewRow?.updatedAt)} />
          <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
            <Button onPress={() => setViewOpen(false)}>Cerrar</Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar visible={snack.visible} onDismiss={() => setSnack({ visible: false, text: '' })} duration={2500}>
        {snack.text}
      </Snackbar>
    </View>
  );
}

/* ========= Subcomponentes ========= */
function Detail({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
      <Text style={{ width: 160, color: '#6B7C87' }}>{label}:</Text>
      <Text style={{ flex: 1, fontWeight: '600' }}>{value || '—'}</Text>
    </View>
  );
}
function RadioRow({ value, onChange }) {
  return (
    <RadioButton.Group onValueChange={onChange} value={value}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Chip selected={value === 'unico'} onPress={() => onChange('unico')}>Único</Chip>
        <Chip selected={value === 'cadax'} onPress={() => onChange('cadax')}>Cada X horas</Chip>
        <Chip selected={value === 'semanal'} onPress={() => onChange('semanal')}>Semanal</Chip>
        <Chip selected={value === 'postcomida'} onPress={() => onChange('postcomida')}>Después de comida</Chip>
      </View>
    </RadioButton.Group>
  );
}
function AutoSelect({ label, value, onClear, data, getLabel, onSelect }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState('');
  const list = useMemo(() => {
    const q = s.trim().toLowerCase();
    const arr = data || [];
    if (!q) return arr;
    return arr.filter((x) => (getLabel(x) || '').toLowerCase().includes(q));
  }, [s, data, getLabel]);

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ marginBottom: 4, color: '#6B7C87' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput style={{ flex: 1 }} value={value} editable={false} placeholder="Seleccione…" />
        <IconButton icon="close" onPress={onClear} />
        <Button mode="outlined" onPress={() => setOpen(true)}>Elegir</Button>
      </View>

      <Portal>
        <Modal visible={open} onDismiss={() => setOpen(false)} contentContainerStyle={styles.picker}>
          <Text variant="titleMedium" style={{ marginBottom: 8 }}>{label}</Text>
          <Searchbar placeholder="Buscar…" value={s} onChangeText={setS} style={{ marginBottom: 8 }} />
          <Card>
            <Card.Content style={{ paddingTop: 0 }}>
              <View style={{ maxHeight: 360 }}>
                <FlatList
                  data={list}
                  keyExtractor={(it, i) => it.id || String(i)}
                  ItemSeparatorComponent={() => <Divider />}
                  renderItem={({ item }) => (
                    <List.Item title={getLabel(item)} onPress={() => { onSelect(item); setOpen(false); }} />
                  )}
                />
              </View>
            </Card.Content>
          </Card>
          <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
            <Button onPress={() => setOpen(false)}>Cerrar</Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}
function WeekdayChips({ selected = [], onToggle }) {
  const days = [
    { n: 0, t: 'Dom' }, { n: 1, t: 'Lun' }, { n: 2, t: 'Mar' },
    { n: 3, t: 'Mié' }, { n: 4, t: 'Jue' }, { n: 5, t: 'Vie' }, { n: 6, t: 'Sáb' },
  ];
  const toggle = (n) => {
    const has = selected.includes(n);
    const next = has ? selected.filter(x => x !== n) : [...selected, n];
    onToggle(next.sort());
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
      {days.map(d => (
        <Chip key={d.n} selected={selected.includes(d.n)} onPress={() => toggle(d.n)}>{d.t}</Chip>
      ))}
    </View>
  );
}

/* ========= Styles ========= */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  card: { borderRadius: 16 },
  center: { alignItems: 'center', paddingVertical: 16 },
  modal: { margin: 16, backgroundColor: 'white', padding: 16, borderRadius: 16, maxHeight: '90%' },
  picker: { margin: 16, backgroundColor: 'white', padding: 16, borderRadius: 16, maxHeight: '80%' },
  section: { marginTop: 6, marginBottom: 6, fontWeight: '700' },
  input: { marginBottom: 10 },
  fab: { position: 'absolute', right: 16, bottom: 16, borderRadius: 24 },
});

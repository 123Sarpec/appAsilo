// vistas/Inventarios.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, Alert, FlatList } from 'react-native';
import {
  Appbar, Text, TextInput, Button, IconButton, Portal, Modal,
  Snackbar, Divider, ActivityIndicator, Searchbar, Card, Chip,
  RadioButton, List
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RNPrint from 'react-native-print';

import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, query as fsQuery, orderBy, setDoc, updateDoc,
  deleteDoc, serverTimestamp, increment, getDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ===== Helpers =====
const slug = (s='') => s.toString().trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

const fmtDate = (ts) => {
  try {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return new Date(d.getTime() - d.getTimezoneOffset()*60000)
      .toISOString().slice(0,10);
  } catch { return ''; }
};

const LOW_STOCK = 10;
const fmt = (n) => Number(n||0).toLocaleString();

// ===== Componente =====
export default function Inventarios() {
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [q,setQ]=useState('');
  const [snack,setSnack]=useState({visible:false,text:''});

  // Modales
  const [addOpen,setAddOpen]=useState(false);
  const [addForm,setAddForm]=useState({nombre:'',stock:''});
  const [editOpen,setEditOpen]=useState(false);
  const [current,setCurrent]=useState(null);
  const [editForm,setEditForm]=useState({nombre:'',stock:''});
  const [incOpen,setIncOpen]=useState(false);
  const [incForm,setIncForm]=useState({delta:''});
  const [paperOpen,setPaperOpen]=useState(false);

  // Export
  const [paper,setPaper]=useState('letter');          // letter | legal
  const [orientation,setOrientation]=useState('landscape'); // portrait | landscape
  const [exporting,setExporting]=useState(false);

  const showSnack=(t)=>setSnack({visible:true,text:t});

  // === Cargar inventarios ===
  useEffect(()=>{
    let unsub;
    const unsubAuth=onAuthStateChanged(auth,(u)=>{
      if(!u){ setLoading(false); return; }
      const qInv=fsQuery(collection(db,'inventarios'), orderBy('nombre'));
      unsub=onSnapshot(
        qInv,
        (snap)=>{
          const list=snap.docs.map(d=>({id:d.id,...d.data()}));
          setItems(list); setLoading(false);
          if (list.some(x => Number(x.stock||0) <= LOW_STOCK)) {
            showSnack(` Hay productos con stock  ${LOW_STOCK}.`);
          }
        },
        (err)=>{ console.log(err); setLoading(false); showSnack(err.code||'Error'); }
      );
    });
    return ()=>{unsubAuth&&unsubAuth(); unsub&&unsub();};
  },[]);

  const filtered=useMemo(()=>{
    const s=q.trim().toLowerCase();
    if(!s) return items;
    return items.filter(x =>
      [x.nombre,x.stock,x.consumido,fmtDate(x.createdAt),fmtDate(x.updatedAt)]
      .join(' ').toLowerCase().includes(s)
    );
  },[items,q]);

  // === CRUD ===
  const createItem=async()=>{
    const nombre=addForm.nombre.trim();
    const stock=Number(addForm.stock);
    if(!nombre) return showSnack('Nombre obligatorio.');
    if(!Number.isFinite(stock)||stock<0) return showSnack('Stock inválido.');
    const id=slug(nombre), ref=doc(db,'inventarios',id), now=serverTimestamp();
    const snap=await getDoc(ref);
    if(snap.exists()){
      await updateDoc(ref,{stock:increment(stock),updatedAt:now});
      showSnack('Stock sumado.');
    }else{
      await setDoc(ref,{nombre,stock,consumido:0,createdAt:now,updatedAt:now});
      showSnack('Inventario creado.');
    }
    setAddOpen(false); setAddForm({nombre:'',stock:''});
  };

  const openEdit = (row) => {
    setCurrent(row);
    setEditForm({ nombre: row.nombre || '', stock: String(row.stock ?? 0) });
    setEditOpen(true);
  };

  const saveEdit=async()=>{
    if(!current) return;
    const nombre=editForm.nombre.trim();
    const stock=Number(editForm.stock);
    if(!nombre||!Number.isFinite(stock)||stock<0) return showSnack('Datos inválidos.');
    await updateDoc(doc(db,'inventarios',current.id),{nombre,stock,updatedAt:serverTimestamp()});
    setEditOpen(false);
  };

  const openIncrement = (row) => {
    setCurrent(row);
    setIncForm({ delta: '' });
    setIncOpen(true);
  };

  const applyIncrement=async()=>{
    if(!current) return;
    const delta=Number(incForm.delta);
    if(!Number.isFinite(delta)||delta===0) return showSnack('Cantidad inválida (+5 / -3).');
    await updateDoc(doc(db,'inventarios',current.id),{
      stock: increment(delta),
      consumido: delta<0 ? increment(Math.abs(delta)) : increment(0),
      updatedAt: serverTimestamp(),
    });
    setIncOpen(false);
  };

  const remove=(row)=>{
    Alert.alert('Eliminar',`¿Borrar “${row.nombre}”?`,[
      {text:'Cancelar',style:'cancel'},
      {text:'Eliminar',style:'destructive',onPress:()=>deleteDoc(doc(db,'inventarios',row.id))}
    ]);
  };

  // ===== Exportar a PDF (compacto y profesional) =====
  const exportPdf = useCallback(async ()=>{
    try{
      setExporting(true);

      const today=new Date().toLocaleString();
      const totalItems=filtered.length;
      const totalStock=filtered.reduce((a,x)=>a+Number(x.stock||0),0);
      const totalCons=filtered.reduce((a,x)=>a+Number(x.consumido||0),0);
      const lowCount=filtered.filter(x=>Number(x.stock||0)<=LOW_STOCK).length;

      const rows = filtered.map((x,i)=>`
        <tr>
          <td class="c">${i+1}</td>
          <td class="name">${x.nombre||'—'}</td>
          <td class="r">${fmt(x.stock||0)}</td>
          <td class="r">${fmt(x.consumido||0)}</td>
          <td class="c">${fmtDate(x.createdAt)||'—'}</td>
          <td class="c">${fmtDate(x.updatedAt)||'—'}</td>
        </tr>
      `).join('');

      const pageCss = `
        @page{
          size:${paper==='legal'?'216mm 356mm':'216mm 279mm'} ${orientation};
          margin:8mm;
        }`;

      const html = `
      <html>
      <head>
        <meta charset="utf-8"/>
        <style>
          ${pageCss}
          *{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial}
          body{margin:0;color:#15202b;}
          .wrap{border:1px solid #e7eaef;border-radius:8px;overflow:hidden;}
          .banner{background:#27b0a6;color:#fff;padding:10px 14px;}
          .banner h1{margin:0;font-size:16px;letter-spacing:.3px}
          .sub{font-size:10px;opacity:.9;margin-top:2px}
          .content{padding:10px 12px}
          .panel{border:1px solid #e7eaef;border-radius:8px;overflow:hidden;margin-bottom:10px}
          .head{background:#f6f9fb;padding:6px 8px;font-weight:700;font-size:11px;border-bottom:1px solid #e7eaef}
          .body{padding:8px}
          .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
          .k{background:#f8fafc;border:1px solid #e7eaef;border-radius:8px;padding:6px}
          .k .label{font-size:9px;color:#667085}
          .k .value{font-weight:800}
          table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}
          th,td{border:1px solid #e7eaef;padding:3px 4px}
          thead{display:table-header-group}
          .c{text-align:center}.r{text-align:right}
          th{background:#fbfdff}
          .name{word-break:break-word}
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="banner">
            <h1>INVENTARIO</h1>
            <div class="sub">Generado: ${today} — Filtro: ${q || 'Todos'}</div>
          </div>
          <div class="content">
            <div class="panel">
              <div class="head">Resumen</div>
              <div class="body">
                <div class="kpi">
                  <div class="k"><div class="label">Items</div><div class="value">${fmt(totalItems)}</div></div>
                  <div class="k"><div class="label">Stock total</div><div class="value">${fmt(totalStock)}</div></div>
                  <div class="k"><div class="label">Consumido</div><div class="value">${fmt(totalCons)}</div></div>
                  <div class="k"><div class="label">Bajo stock (≤ ${LOW_STOCK})</div><div class="value">${fmt(lowCount)}</div></div>
                </div>
              </div>
            </div>

            <div class="panel" style="margin-bottom:0">
              <div class="head">Detalle de inventario</div>
              <div class="body" style="padding:0">
                <table>
                  <thead>
                    <tr>
                      <th class="c" style="width:28px">#</th>
                      <th>Nombre</th>
                      <th class="r" style="width:70px">Stock</th>
                      <th class="r" style="width:80px">Consumido</th>
                      <th class="c" style="width:88px">Creado</th>
                      <th class="c" style="width:88px">Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows || `<tr><td class="c" colspan="6" style="color:#667085">Sin datos</td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>`;

      await RNPrint.print({ html });
    }catch(e){ console.log(e); Alert.alert('Error',e?.message||'No se pudo exportar'); }
    finally{ setExporting(false); }
  },[filtered,q,paper,orientation]);

  // ===== UI =====
  return (
    <View style={styles.screen}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title="Inventario" />
        <Appbar.Action icon="download" onPress={exportPdf} disabled={exporting}/>
        <Appbar.Action icon="plus" onPress={()=>setAddOpen(true)}/>
      </Appbar.Header>

      <View style={styles.searchWrap}>
        <Searchbar
          placeholder="Buscar por nombre, stock, consumido o fecha…"
          value={q}
          onChangeText={setQ}
                   style={{ marginBottom: 10, backgroundColor: '#0483a04b', borderRadius: 16 }}
          inputStyle={{ color: '#0a0909ff' }}
          
        />
      </View>

      {/* === Lista con SCROLL real (FlatList) === */}
      <View style={styles.listWrap}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 8, color: '#6B7C87' }}>Cargando…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(row)=>row.id}
            ItemSeparatorComponent={() => <Divider />}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
            renderItem={({ item: row }) => {
              const low = Number(row.stock || 0) <= LOW_STOCK;
              const created = fmtDate(row.createdAt) || '—';
              const consumido = Number(row.consumido || 0);
              return (
                <Card mode="elevated" style={styles.rowCard}>
                  <Card.Content style={{ paddingVertical: 10 }}>
                    <List.Item
                      title={row.nombre}
                      titleStyle={[styles.itemTitle, low && { color: '#B71C1C' }]}
                      description={() => (
                        <View style={{ gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <Text style={styles.descText}>Stock: {fmt(row.stock ?? 0)}</Text>
                            <Text style={styles.descText}>Consumido: {fmt(consumido)}</Text>
                            {low && (
                              <Chip compact selected color="#fff" style={styles.lowChip} textStyle={{ color: '#fff' }}>
                                Bajo stock
                              </Chip>
                            )}
                          </View>
                          <Text style={[styles.descText, { fontStyle: 'italic' }]}>
                            Fecha de registro: {created}
                          </Text>
                        </View>
                      )}
                      left={() => (
                        <View style={{ justifyContent: 'center', alignItems: 'center', width: 40 }}>
                          <Icon name="pill" size={24} color={low ? '#B71C1C' : '#1565C0'} />
                        </View>
                      )}
                      right={() => (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <IconButton icon="plus-circle" onPress={() => openIncrement(row)} />
                          <IconButton icon="pencil" onPress={() => openEdit(row)} />
                          <IconButton icon="delete" onPress={() => remove(row)} />
                        </View>
                      )}
                    />
                  </Card.Content>
                </Card>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingVertical: 16 }}>
                <Text style={{ color: '#6B7C87', textAlign: 'center' }}>Sin resultados</Text>
              </View>
            }
          />
        )}
      </View>



      {/* Crear */}
      <Portal>
        <Modal visible={addOpen} onDismiss={()=>setAddOpen(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={{marginBottom:8}}>Nuevo inventario</Text>
          <TextInput label="Nombre *" value={addForm.nombre} onChangeText={v=>setAddForm(s=>({...s,nombre:v}))} style={styles.input}/>
          <TextInput label="Stock inicial *" value={addForm.stock} onChangeText={v=>setAddForm(s=>({...s,stock:v}))} keyboardType="numeric" style={styles.input}/>
          <View style={{flexDirection:'row',justifyContent:'flex-end',gap:8}}>
            <Button onPress={()=>setAddOpen(false)}>Cancelar</Button>
            <Button mode="contained" onPress={createItem}>Crear</Button>
          </View>
        </Modal>
      </Portal>

      {/* Editar */}
      <Portal>
        <Modal visible={editOpen} onDismiss={()=>setEditOpen(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={{marginBottom:8}}>Editar inventario</Text>
          <TextInput label="Nombre *" value={editForm.nombre} onChangeText={v=>setEditForm(s=>({...s,nombre:v}))} style={styles.input}/>
          <TextInput label="Stock *" value={editForm.stock} onChangeText={v=>setEditForm(s=>({...s,stock:v}))} keyboardType="numeric" style={styles.input}/>
          <View style={{flexDirection:'row',justifyContent:'flex-end',gap:8}}>
            <Button onPress={()=>setEditOpen(false)}>Cancelar</Button>
            <Button mode="contained" onPress={saveEdit}>Guardar</Button>
          </View>
        </Modal>
      </Portal>

      {/* Agregar/Descontar */}
      <Portal>
        <Modal visible={incOpen} onDismiss={()=>setIncOpen(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={{marginBottom:8}}>Agregar / Descontar</Text>
          <Text style={{marginBottom:6}}>Producto: <Text style={{fontWeight:'700'}}>{current?.nombre || '—'}</Text></Text>
          <TextInput label="Cantidad (ej. +5 o -3)" value={incForm.delta} onChangeText={v=>setIncForm({delta:v})} keyboardType="numeric" style={styles.input}/>
          <View style={{flexDirection:'row',justifyContent:'flex-end',gap:8}}>
            <Button onPress={()=>setIncOpen(false)}>Cancelar</Button>
            <Button mode="contained" onPress={applyIncrement}>Aplicar</Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar visible={snack.visible} onDismiss={()=>setSnack({visible:false,text:''})} duration={2500}>
        {snack.text}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  searchWrap: { paddingHorizontal: 12, paddingTop: 8 },
  listWrap: { flex: 1 },                                // <- espacio para el FlatList
  rowCard: { marginVertical: 6, borderRadius: 14 },

  center: { alignItems: 'center', paddingVertical: 20 },
  itemTitle: { fontWeight: '700', fontSize: 16, color: '#0F172A' },
  descText: { color: '#607D8B' },
  lowChip: { backgroundColor: '#D32F2F' },

  bottomBar: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 2 },

  modal:{ margin:16, backgroundColor:'#fff', padding:16, borderRadius:12, maxHeight:'90%' },
  input:{ marginBottom:10 },
});

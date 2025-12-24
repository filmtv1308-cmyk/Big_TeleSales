(function(){
  const Storage = (() => {
    const DB_NAME = 'BigTeleSalesDB';
    const DB_VERSION = 6; // текущая версия со всеми миграциями
    let dbPromise;

    function openDB(){
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = req.result;
          // users
          if (!db.objectStoreNames.contains('users')){
            const store = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
            store.createIndex('by_email', 'email', { unique: true });
          } else {
            const store = req.transaction.objectStore('users');
            if (!store.indexNames.contains('by_email')){
              try { store.createIndex('by_email', 'email', { unique: true }); } catch(e){ try { store.createIndex('by_email', 'email', { unique: false }); } catch(_){ }
              }
            }
          }
          if (!db.objectStoreNames.contains('products')){ db.createObjectStore('products', { keyPath: 'sku' }); }
          if (!db.objectStoreNames.contains('productImages')){ db.createObjectStore('productImages', { keyPath: 'sku' }); }
          if (!db.objectStoreNames.contains('outlets')){ db.createObjectStore('outlets', { keyPath: 'code' }); }
          if (!db.objectStoreNames.contains('contacts')){ db.createObjectStore('contacts', { keyPath: 'code' }); }
          if (!db.objectStoreNames.contains('orders')){ const store = db.createObjectStore('orders', { keyPath: 'id' }); store.createIndex('by_date', 'date'); store.createIndex('by_operator', 'operator'); }
          if (!db.objectStoreNames.contains('visits')){ const store = db.createObjectStore('visits', { keyPath: 'id' }); store.createIndex('by_date', 'date'); store.createIndex('by_operator', 'operator'); store.createIndex('plannedDate', 'plannedDate', { unique: false }); store.createIndex('operatorEmail_plannedDate', ['operatorEmail', 'plannedDate'], { unique: false }); }
          else { const store = req.transaction.objectStore('visits'); if (!store.indexNames.contains('plannedDate')) store.createIndex('plannedDate', 'plannedDate', { unique: false }); if (!store.indexNames.contains('operatorEmail_plannedDate')) store.createIndex('operatorEmail_plannedDate', ['operatorEmail', 'plannedDate'], { unique: false }); }
          if (!db.objectStoreNames.contains('settings')){ db.createObjectStore('settings', { keyPath: 'key' }); }
          if (!db.objectStoreNames.contains('promos')){ const store = db.createObjectStore('promos', { keyPath: 'id' }); store.createIndex('by_active', 'active'); }
          if (!db.objectStoreNames.contains('routes')){ const store = db.createObjectStore('routes', { keyPath: 'outletCode' }); store.createIndex('operatorEmail', 'operatorEmail', { unique: false }); store.createIndex('priority', 'priority', { unique: false }); }
          if (!db.objectStoreNames.contains('notifications')){ const store = db.createObjectStore('notifications', { keyPath: 'id' }); store.createIndex('read', 'read', { unique: false }); store.createIndex('createdAt', 'createdAt', { unique: false }); }
          if (!db.objectStoreNames.contains('activityLog')){ const store = db.createObjectStore('activityLog', { keyPath: 'id' }); store.createIndex('timestamp', 'timestamp', { unique: false }); store.createIndex('userEmail', 'userEmail', { unique: false }); store.createIndex('action', 'action', { unique: false }); }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return dbPromise;
    }

    function tx(storeName, mode='readonly'){ return openDB().then(db => db.transaction(storeName, mode)); }
    async function add(storeName, value){ const t = await tx(storeName, 'readwrite'); return reqToPromise(t.objectStore(storeName).add(value)); }
    async function put(storeName, value){ const t = await tx(storeName, 'readwrite'); return reqToPromise(t.objectStore(storeName).put(value)); }
    async function get(storeName, key){ const t = await tx(storeName); return reqToPromise(t.objectStore(storeName).get(key)); }
    async function getAll(storeName){ const t = await tx(storeName); return reqToPromise(t.objectStore(storeName).getAll()); }
    async function del(storeName, key){ const t = await tx(storeName, 'readwrite'); return reqToPromise(t.objectStore(storeName).delete(key)); }
    async function clearStore(storeName){ const t = await tx(storeName, 'readwrite'); return reqToPromise(t.objectStore(storeName).clear()); }
    async function getByIndex(storeName, indexName, value){ const t = await tx(storeName); return reqToPromise(t.objectStore(storeName).index(indexName).get(value)); }
    async function exportStore(storeName){ return getAll(storeName); }
    function reqToPromise(req){ return new Promise((res, rej)=>{ req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

    function setSession(session){ localStorage.setItem('bts_session', JSON.stringify(session)); }
    function getSession(){ try { return JSON.parse(localStorage.getItem('bts_session')||'null'); } catch(e){ return null; } }
    function clearSession(){ localStorage.removeItem('bts_session'); }

    async function seedIfEmpty(){
      const users = await getAll('users').catch(()=>[]);
      if (!users || users.length === 0){ await add('users', { email: 'admin@bigtelesales.local', password: 'admin123', role: 'admin', createdAt: Date.now() }); await add('users', { email: 'operator@bigtelesales.local', password: 'operator', role: 'operator', createdAt: Date.now() }); }
      else { const admin = await getByIndex('users', 'by_email', 'admin@bigtelesales.local').catch(()=>null); if (!admin){ await add('users', { email: 'admin@bigtelesales.local', password: 'admin123', role: 'admin', createdAt: Date.now() }); } }
      const mat = await get('settings', 'materials'); if (!mat){ await put('settings', { key: 'materials', value: [ { name: 'Коммерческое предложение (PDF)', url: 'data:application/pdf;base64,' }, { name: 'Прайс-лист (CSV)', url: 'data:text/csv;base64,' } ]}); }
      const prods = await getAll('products'); if (!prods || prods.length === 0){ await put('products', { sku: 'SKU-1001', name: 'Наушники SuperSound', price: 2490, stock: 51, priceBase:2490, sortOrder:1, topSku: 1 }); await put('products', { sku: 'SKU-1002', name: 'Веб-камера HD Pro', price: 3990, stock: 27, priceBase:3990, sortOrder:2 }); await put('products', { sku: 'SKU-1003', name: 'Микрофон Studio', price: 5490, stock: 13, priceBase:5490, sortOrder:3 }); }
      const outlets = await getAll('outlets'); if (!outlets || outlets.length === 0){ await put('outlets', { code: 'OUT-001', name: 'Магазин Техника №1', city: 'Москва', inn:'7701000000', address:'г. Москва', paymentTerms:'Банк 14 дней', direction:'Розница', creditLimit:50000, debt:12000 }); await put('outlets', { code: 'OUT-002', name: 'ЭлектроМаркет', city: 'Санкт-Петербург', inn:'7801000000', address:'г. Санкт-Петербург', paymentTerms:'Наличные по факту', direction:'Розница', creditLimit:80000, debt:0 }); }
      const routes = await getAll('routes').catch(()=>[]);
      if (!routes || routes.length === 0){ await put('routes', { outletCode:'OUT-001', daysOfWeek:[1,3,5], operatorEmail:'operator@bigtelesales.local', frequency:'1', priority:1, lastVisitDate:null, nextPlannedDate:null, updatedAt: Date.now() }); await put('routes', { outletCode:'OUT-002', daysOfWeek:[2,4], operatorEmail:'operator@bigtelesales.local', frequency:'2.1', priority:2, lastVisitDate:null, nextPlannedDate:null, updatedAt: Date.now() }); }
    }

    async function migrateIfNeeded(){
      try {
        await openDB();
        const users = await getAll('users').catch(()=>[]);
        const seen = new Map(); const toDelete = [];
        for (const u of users){ const norm = String(u.email||'').trim().toLowerCase(); if (!norm){ toDelete.push(u.id); continue; } if (u.email !== norm){ u.email = norm; try { await put('users', u); } catch(e){} } if (seen.has(norm)){ toDelete.push(u.id); } else { seen.set(norm, u.id); } }
        for (const id of toDelete){ try { await del('users', id); } catch(e){} }
        let admin = await getByIndex('users', 'by_email', 'admin@bigtelesales.local').catch(()=>null); if (!admin){ await add('users', { email: 'admin@bigtelesales.local', password: 'admin123', role: 'admin', createdAt: Date.now() }); }
        const mat = await get('settings', 'materials').catch(()=>null); if (!mat){ await put('settings', { key:'materials', value:[ { name:'Коммерческое предложение (PDF)', url:'data:application/pdf;base64,' }, { name:'Прайс-лист (CSV)', url:'data:text/csv;base64,' } ]}); }
        const promosSetting = await get('settings','promos').catch(()=>null);
        try { const promosStoreAll = await getAll('promos').catch(()=>[]); if ((!promosStoreAll || promosStoreAll.length===0) && promosSetting && Array.isArray(promosSetting.value)){ for (const p of promosSetting.value){ if (!p || !p.id) p.id = (p && p.name? 'promo_'+p.name : (globalThis.Utils?.generateId?.('promo') || 'promo_'+Date.now())); await put('promos', p); } } } catch(e) { }
        try { const routes = await getAll('routes').catch(()=>[]); for (const r of (routes||[])){ if (!r || !r.outletCode) continue; if (r.operatorEmail) r.operatorEmail = String(r.operatorEmail).trim().toLowerCase(); if (r.frequency){ r.frequency = (globalThis.Scheduler && typeof globalThis.Scheduler.normalizeWeekCode === 'function') ? globalThis.Scheduler.normalizeWeekCode(r.frequency) : String(r.frequency); } else { r.frequency = '1'; } if (!Array.isArray(r.daysOfWeek) || !r.daysOfWeek.length){ const s = r.schedule || {}; const days = []; if (s.mon) days.push(1); if (s.tue) days.push(2); if (s.wed) days.push(3); if (s.thu) days.push(4); if (s.fri) days.push(5); if (s.sat) days.push(6); if (s.sun) days.push(7); if (days.length) r.daysOfWeek = days; }
            if (r.dayOfWeek){ const d = Number(r.dayOfWeek); if (isFinite(d) && d>=1 && d<=7){ const set = new Set([...(r.daysOfWeek||[]).map(Number), d]); r.daysOfWeek = Array.from(set).sort((a,b)=>a-b); } delete r.dayOfWeek; }
            r.updatedAt = Date.now(); await put('routes', r); }
        } catch(e){ }
        await put('settings', { key:'migrated_v1', value: Date.now() });
      } catch(e){ console.warn('Migration skipped', e); }
    }

    async function resetAndSeed(){ const stores = ['users','products','productImages','outlets','contacts','orders','visits','settings','promos','routes','notifications','activityLog']; for (const s of stores){ try { await clearStore(s); } catch(e){} } await seedIfEmpty(); }

    return { openDB, add, put, get, getAll, del, clearStore, getByIndex, exportStore, seedIfEmpty, migrateIfNeeded, resetAndSeed, setSession, getSession, clearSession };
  })();
  window.Storage = Storage;
})();

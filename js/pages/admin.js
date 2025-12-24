// js/pages/admin.js — Этап 5: вынос полной логики Админ‑панели
// Модуль запускается лениво из Router.onAfterNavigate. Внутри настраиваются
// все плитки (пользователи, товары, изображения, точки, контакты, промо,
// маршруты, материалы, бэкап), счётчики, шаблоны и импорты/экспорты.

/* global Storage, Utils, XLSXLoader, XLSX, PromoEngine, Scheduler */

export default async function admin(params = {}) {
  try {
    // Тихая проверка XLSX
    let xlsxReady = false;
    try { xlsxReady = await XLSXLoader.ensure(); } catch(_) { xlsxReady = false; }
    const xlsxStatusEl = document.getElementById('xlsxStatus');
    if (xlsxStatusEl){
      if (xlsxReady){
        xlsxStatusEl.textContent = 'Excel: доступен';
        xlsxStatusEl.className = 'text-xs px-2 py-1 rounded-lg border bg-green-50 text-green-700';
      } else {
        xlsxStatusEl.textContent = 'Excel: недоступен';
        xlsxStatusEl.className = 'text-xs px-2 py-1 rounded-lg border bg-amber-50 text-amber-800';
      }
    }

    // Хелперы
    function esc(s){ return String(s??''); }
    function numberOr(v, def=0){ const n = Number(String(v??'').toString().replace(',','.')); return Number.isFinite(n)? n : def; }
    function normalizeTopSku(raw){
      const s = String(raw ?? '').trim().toLowerCase();
      if (raw === 1 || raw === true) return 1;
      if (s === '1' || s === 'да' || s === 'true' || s === 'yes' || s === 'y' || s === 'x') return 1;
      return 0;
    }
    async function refreshAdminCounts(){
      try {
        const [prods, outlets, contacts, promos, routes] = await Promise.all([
          Storage.getAll('products').catch(()=>[]),
          Storage.getAll('outlets').catch(()=>[]),
          Storage.getAll('contacts').catch(()=>[]),
          Storage.getAll('promos').catch(()=>[]),
          Storage.getAll('routes').catch(()=>[])
        ]);
        const prodCountEl = document.getElementById('prodCount');
        const outCountEl = document.getElementById('outCount');
        const contCountEl = document.getElementById('contCount');
        const promoCountEl = document.getElementById('promoCount');
        const routesCountEl = document.getElementById('routesCount');
        if (prodCountEl) prodCountEl.textContent = String(prods.length);
        if (outCountEl) outCountEl.textContent = String(outlets.length);
        if (contCountEl) contCountEl.textContent = String(contacts.length);
        if (promoCountEl){
          const active = PromoEngine.getActive(promos);
          promoCountEl.textContent = String(active.length);
        }
        if (routesCountEl) routesCountEl.textContent = String(routes.length);
      } catch(e){ console.warn('refreshAdminCounts error', e); }
    }

    async function requireXLSX(){
      const ok = await XLSXLoader.ensure().catch(()=>false);
      if (!ok || typeof XLSX === 'undefined' || !XLSX.utils){
        Utils.showToast('Excel-функции недоступны: библиотека XLSX не загрузилась. Проверьте интернет/блокировщики.', 'error');
        return false;
      }
      return true;
    }

    async function downloadExcelTemplate(headers, sheetName, fileBaseName, exampleRows=[]) {
      const ok = await XLSXLoader.ensure().catch(()=>false);
      if (ok && typeof XLSX !== 'undefined' && XLSX?.utils?.aoa_to_sheet){
        const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        Utils.saveWorkbookXLSX(wb, `${fileBaseName}.xlsx`);
        return;
      }
      // Fallback: Excel-совместимый .xls
      const xml = Utils.buildExcelXmlTable(headers, exampleRows, sheetName);
      Utils.downloadFile(`${fileBaseName}.xls`, xml, 'application/vnd.ms-excel');
      Utils.showToast('XLSX недоступен — скачан Excel .xls (совместимый формат)', 'warning');
    }

    async function readExcelToJson(file){
      const name = String(file?.name||'').toLowerCase().trim();
      const isXlsx = name.endsWith('.xlsx');
      const isXls = name.endsWith('.xls');
      if (!isXlsx && !isXls){ throw new Error('Поддерживаются только файлы Excel: .xlsx или .xls'); }
      const ok = await XLSXLoader.ensure().catch(()=>false);
      if (ok && typeof XLSX !== 'undefined' && XLSX.read){
        try {
          const data = await file.arrayBuffer();
          const wb = XLSX.read(data, { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          return XLSX.utils.sheet_to_json(ws, { defval:'' });
        } catch(e){
          if (isXls){
            try {
              const text = await file.text();
              const parsed = Utils.parseSpreadsheetML(text);
              if (parsed && parsed.length) return parsed;
            } catch(_){ }
          }
          throw e;
        }
      }
      // XLSX не доступен: попробуем SpreadsheetML (.xls XML)
      if (isXls){
        try { const text = await file.text(); const parsed = Utils.parseSpreadsheetML(text); if (parsed && parsed.length) return parsed; } catch(_){ }
      }
      throw new Error('Не удалось прочитать Excel. Проверьте файл и подключение XLSX.');
    }

    // ===== Пользователи =====
    const usersTbody = document.getElementById('usersTable');
    async function renderUsers(){
      if (!usersTbody) return;
      const users = await Storage.getAll('users').catch(()=>[]);
      usersTbody.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="py-2 pr-2">${esc(u.email)}</td>
          <td class="py-2 pr-2">${esc(u.role)}</td>
          <td class="py-2 pr-2">${Utils.formatDate(u.createdAt||Date.now(), 'dd.MM.yyyy')}</td>
          <td class="py-2 pr-2">
            <button class="text-sm text-gray-600 hover:text-gray-800" data-action="viewpass" data-id="${u.id}">Показать пароль</button>
            <button class="ml-2 text-sm text-indigo-600 hover:text-indigo-700" data-action="pass" data-id="${u.id}">Сгенерировать пароль</button>
            <button class="ml-2 text-sm text-red-600 hover:text-red-700" data-action="delete" data-id="${u.id}">Удалить</button>
          </td>`;
        usersTbody.appendChild(tr);
      });
    }
    await renderUsers();

    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn){
      addUserBtn.addEventListener('click', async ()=>{
        const c = document.createElement('div');
        c.innerHTML = `
          <div class="space-y-3">
            <div><label class="block text-sm mb-1">Email</label><input id="email" type="email" class="w-full border rounded-lg px-3 py-2"></div>
            <div><label class="block text-sm mb-1">Роль</label><select id="role" class="w-full border rounded-lg px-3 py-2"><option value="operator">Оператор</option><option value="admin">Администратор</option></select></div>
            <div class="flex items-center gap-2"><button id="genPass" class="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">Сгенерировать пароль</button><span id="passOut" class="text-sm text-gray-600"></span></div>
            <div><button id="sendMail" class="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">📧 Отправить на почту</button></div>
          </div>`;
        const okPromise = Utils.showModal('Новый пользователь', c, [
          {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
          {label:'Создать', value:true, class:'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg'}
        ]);
        let generated = '';
        c.querySelector('#genPass')?.addEventListener('click', async ()=>{ generated = Utils.generatePassword(10); c.querySelector('#passOut').textContent = generated; await Utils.copyToClipboard(generated); });
        c.querySelector('#sendMail')?.addEventListener('click', ()=>{
          const email = (c.querySelector('#email')?.value||'').trim();
          const pass = generated || 'Сгенерируйте пароль';
          const subject = encodeURIComponent('Ваш доступ к Big TeleSales');
          const body = encodeURIComponent(`Здравствуйте!\n\nВаш доступ к Big TeleSales:\nЛогин: ${email}\nПароль: ${pass}\n\nСсылка: ${location.href}`);
          location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        });
        const ok = await okPromise;
        if (!ok) return;
        const email = c.querySelector('#email')?.value?.trim().toLowerCase();
        const roleVal = String(c.querySelector('#role')?.value||'operator').trim().toLowerCase();
        if (!email){ Utils.showToast('Укажите email', 'warning'); return; }
        const password = generated || Utils.generatePassword(10);
        try { await Storage.add('users', { email, role: (roleVal==='admin'?'admin':'operator'), password, createdAt: Date.now() }); await renderUsers(); Utils.showToast('Пользователь создан', 'success'); }
        catch(e){ Utils.showToast('Ошибка: возможно, email уже используется', 'error'); }
      });
    }

    const resetAdminBtn = document.getElementById('resetAdminBtn');
    if (resetAdminBtn){
      resetAdminBtn.addEventListener('click', async ()=>{
        const u = await Storage.getByIndex('users','by_email','admin@bigtelesales.local').catch(()=>null);
        if (!u){ await Storage.add('users', { email:'admin@bigtelesales.local', password:'admin123', role:'admin', createdAt: Date.now() }); }
        else { u.password='admin123'; await Storage.put('users', u); }
        Utils.showToast('Пароль admin сброшен', 'success');
        await renderUsers();
      });
    }

    usersTbody?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = Number(btn.getAttribute('data-id'));
      const action = btn.getAttribute('data-action');
      const user = await Storage.get('users', id).catch(()=>null);
      if (!user) return;
      if (action==='viewpass'){
        const c = document.createElement('div');
        c.innerHTML = `
          <div class="space-y-2">
            <div class="text-sm text-gray-600">Email: <b>${esc(user.email)}</b></div>
            <div class="text-sm text-gray-600">Роль: <b>${esc(user.role)}</b></div>
            <div class="border rounded-lg p-3 bg-gray-50">
              <div class="text-xs text-gray-500 mb-1">Пароль</div>
              <div class="flex items-center gap-2">
                <input class="flex-1 border rounded-lg px-3 py-2" value="${esc(user.password||'')}" readonly />
                <button id="copyUserPassBtn" class="border px-3 py-2 rounded-lg text-sm hover:bg-gray-50" title="Скопировать"><i class="bi bi-clipboard"></i></button>
              </div>
            </div>
          </div>`;
        Utils.showModal('Пароль пользователя', c, [{label:'Закрыть', value:false, class:'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg'}]);
        c.querySelector('#copyUserPassBtn')?.addEventListener('click', async (ev)=>{ ev.preventDefault(); await Utils.copyToClipboard(String(user.password||'')); });
      }
      if (action==='pass'){
        const newPass = Utils.generatePassword(10); user.password = newPass; await Storage.put('users', user); Utils.showToast('Пароль сгенерирован и сохранен', 'success'); await Utils.copyToClipboard(newPass);
      }
      if (action==='delete'){
        const sess = Storage.getSession(); if (sess && sess.userId === id) return Utils.showToast('Нельзя удалить текущего пользователя', 'warning');
        await Storage.del('users', id); Utils.showToast('Пользователь удален', 'info'); await renderUsers();
      }
    });

    // ===== Товары =====
    const prodSpinner = document.getElementById('prodSpinner');
    const prodProgWrap = document.getElementById('prodProgressWrap');
    const prodProg = document.getElementById('prodProgress');
    const prodTemplateBtn = document.getElementById('prodTemplateBtn');
    const prodImportBtn = document.getElementById('prodImportBtn');
    const prodExportBtn = document.getElementById('prodExportBtn');
    const prodClearBtn = document.getElementById('prodClearBtn');

    const updateProdProgress = (p)=>{ if (!prodProgWrap||!prodProg) return; prodProgWrap.classList.remove('hidden'); prodProg.style.width = Math.min(100, Math.max(0, p)) + '%'; if (p>=100) setTimeout(()=>prodProgWrap.classList.add('hidden'), 600); };

    prodTemplateBtn?.addEventListener('click', async ()=>{
      const headers = ['Артикул','Наименование товара','Полное наименование','Описание','Поставщик','Производитель','Категория','Субкатегория','Бренд','Штрихкод','Кол-во в коробке','Квант отгрузки','Цена без ПРОМО','Цена с ПРОМО','ТОП СКЮ (1/0)','Сортировка'];
      await downloadExcelTemplate(headers, 'Товары', 'template_products');
    });

    prodExportBtn?.addEventListener('click', async ()=>{
      if (!await requireXLSX()) return;
      try {
        const items = await Storage.getAll('products');
        const headers = ['Артикул','Наименование товара','Полное наименование','Описание','Поставщик','Производитель','Категория','Субкатегория','Бренд','Штрихкод','Кол-во в коробке','Квант отгрузки','Цена без ПРОМО','Цена с ПРОМО','ТОП СКЮ (1/0)','Сортировка'];
        const rows = items.map(p=>[
          p.sku||'', p.name||'', p.fullName||'', p.description||'', p.vendor||'', p.manufacturer||'', p.category||'', p.subcategory||'', p.brand||'', p.barcode||'', p.unitsInBox||'', p.shipmentQuantum||'', p.priceBase||'', p.pricePromo||'', (p.topSku===1||p.topSku==='1'||p.topSku===true)?1:0, p.sortOrder||''
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Товары');
        Utils.saveWorkbookXLSX(wb, 'products.xlsx');
        Utils.showToast('Экспорт выполнен', 'success');
      } catch(e){ console.error('prodExportBtn error', e); Utils.showToast('Ошибка экспорта товаров', 'error'); }
    });

    prodImportBtn?.addEventListener('click', ()=>{
      const input = document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls';
      input.onchange = async ()=>{
        const file = input.files[0]; if (!file) return;
        prodSpinner?.classList.remove('hidden'); updateProdProgress(0);
        try{
          const json = await readExcelToJson(file);
          let added=0, updated=0; let idx=0; const total=json.length || 1;
          for (const row of json){
            idx++;
            const sku = String(row['Артикул']||row['артикул']||row['SKU']||row['sku']||'').trim();
            if (!sku){ updateProdProgress(Math.round(idx/total*100)); continue; }
            const rec = await Storage.get('products', sku).catch(()=>null);
            const barcodeRaw = (()=>{
              let raw = (row['Штрихкод'] ?? row['Штрихкод '] ?? row['ШК'] ?? row['Barcode'] ?? row['barcode']);
              if (raw === undefined){ const key = Object.keys(row||{}).find(k => String(k||'').trim().toLowerCase() === 'штрихкод'); if (key) raw = row[key]; }
              return String(raw ?? '').trim();
            })();
            const prod = {
              sku,
              name: row['Наименование товара']||row['Наименование']||row['name']||'',
              fullName: row['Полное наименование']||row['fullName']||'',
              description: row['Описание']||row['Описание товара']||row['description']||'',
              vendor: row['Поставщик']||row['vendor']||'',
              manufacturer: row['Производитель']||row['manufacturer']||'',
              category: row['Категория']||row['category']||'',
              subcategory: row['Субкатегория']||row['subcategory']||'',
              brand: row['Бренд']||row['brand']||'',
              barcode: barcodeRaw,
              unitsInBox: numberOr(row['Кол-во в коробке'] ?? row['Кол-во в коробке '] ?? row['unitsInBox'], 0),
              shipmentQuantum: numberOr(row['Квант отгрузки'] ?? row['shipmentQuantum'], 0),
              priceBase: numberOr(row['Цена без ПРОМО'] ?? row['priceBase'], 0),
              pricePromo: numberOr(row['Цена с ПРОМО'] ?? row['pricePromo'], 0),
              topSku: normalizeTopSku(row['ТОП СКЮ (1/0)'] ?? row['ТОП СКЮ'] ?? row['TOP SKU']),
              sortOrder: numberOr(row['Сортировка'] ?? row['order'] ?? row['sortOrder'], 0)
            };
            if (rec){ await Storage.put('products', { ...rec, ...prod }); updated++; }
            else { await Storage.put('products', prod); added++; }
            updateProdProgress(Math.round(idx/total*100));
          }
          Utils.showToast(`Загружено ${added} товаров, обновлено ${updated}`, 'success');
          await refreshAdminCounts();
        } catch(e){ console.error('prodImportBtn error', e); Utils.showToast(String(e?.message||'Ошибка импорта товаров'), 'error'); }
        finally { prodSpinner?.classList.add('hidden'); setTimeout(()=>updateProdProgress(100), 50); }
      };
      input.click();
    });

    prodClearBtn?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('Очистка', 'Очистить все товары?', [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]);
      if (!ok) return;
      await Storage.clearStore('products');
      await refreshAdminCounts();
      Utils.showToast('Товары очищены', 'info');
    });

    // ===== Изображения =====
    const imgSelectBtn = document.getElementById('imgSelectBtn');
    const imgFiles = document.getElementById('imgFiles');
    const imgSpinner = document.getElementById('imgSpinner');
    const imgProgWrap = document.getElementById('imgProgressWrap');
    const imgProg = document.getElementById('imgProgress');
    const imgSummary = document.getElementById('imgSummary');
    const updateImgProgress = (p)=>{ if (!imgProgWrap||!imgProg) return; imgProgWrap.classList.remove('hidden'); imgProg.style.width = Math.min(100, Math.max(0, p)) + '%'; if (p>=100) setTimeout(()=>imgProgWrap.classList.add('hidden'), 600); };

    imgSelectBtn?.addEventListener('click', ()=> imgFiles?.click());

    imgFiles?.addEventListener('change', async ()=>{
      const files = Array.from(imgFiles.files||[]);
      if (!files.length) return;
      imgSpinner?.classList.remove('hidden'); updateImgProgress(0); imgSummary.textContent='';

      // Подготовка: группировка по ключу (skuCandidate)
      const metas = files.map(f=>{
        const name = String(f.name||'');
        const skuCandidate = name.replace(/\.[^.]+$/, '').replace(/\(\d+\)$/,'').trim();
        const isAdditional = /\(\d+\)\.[^.]+$/i.test(name);
        return { file:f, skuCandidate, isAdditional };
      });
      const bySku = new Map(); metas.forEach(m=>{ if (!bySku.has(m.skuCandidate)) bySku.set(m.skuCandidate, { main:null, extras:[] }); });

      // Параллельная обработка
      const concurrency = Math.min(4, Math.max(2, Math.floor((navigator.hardwareConcurrency||8)/2)));
      let processed = 0;
      await mapLimit(metas, concurrency, async (m)=>{
        const base64 = await resizeToBase64Fast(m.file, 800, 800);
        const entry = bySku.get(m.skuCandidate); if (!entry) return;
        if (m.isAdditional) entry.extras.push(base64); else entry.main = base64;
        processed++; updateImgProgress(Math.round(processed/files.length*100));
      });

      const prods = await Storage.getAll('products');
      const barcodeToSku = new Map(prods.map(p => [String(p.barcode||'').trim(), p.sku]));
      let photosSaved=0; let itemsTouched=0;
      for (const [key, val] of bySku){
        const normalizedKey = String(key||'').trim().replace(/\.(jpe?g|png|webp)$/i, '');
        let sku = normalizedKey;
        if (normalizedKey === '1111111111'){
          sku = '1111111111';
        } else {
          if (!prods.find(p=>p.sku===sku)){
            const mapped = barcodeToSku.get(normalizedKey) || barcodeToSku.get(String(key||'').trim());
            if (mapped) sku = mapped; else continue;
          }
        }
        const images = []; if (val.main) images.push(val.main); images.push(...val.extras);
        if (images.length){ await Storage.put('productImages', { sku, images }); if (sku==='1111111111'){ try { await Storage.put('productImages', { sku:'1111111111.jpg', images }); } catch(_){ } }
          photosSaved += images.length; itemsTouched++; }
      }
      imgSummary.textContent = `Успешно загружено: ${photosSaved} фото для ${itemsTouched} товаров`;
      Utils.showToast('Импорт изображений завершен', 'success');
      imgSpinner?.classList.add('hidden'); setTimeout(()=>updateImgProgress(100), 50);
      imgFiles.value='';
    });

    async function mapLimit(items, limit, worker){
      const queue = items.slice();
      const runners = new Array(Math.min(limit, queue.length)).fill(0).map(async ()=>{
        while(queue.length){ const item = queue.shift(); try { await worker(item); } catch(e){ console.warn('mapLimit worker error', e); } }
      });
      await Promise.all(runners);
    }
    async function resizeToBase64Fast(file, maxW, maxH){
      if (typeof createImageBitmap === 'function'){
        let bmp = null;
        try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch(_){ try { bmp = await createImageBitmap(file); } catch(__){} }
        if (bmp){
          try {
            let w = bmp.width, h = bmp.height; const ratio = Math.min(maxW/w, maxH/h, 1); w = Math.max(1, Math.round(w * ratio)); h = Math.max(1, Math.round(h * ratio));
            const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
            canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d', { alpha:false }); ctx.drawImage(bmp, 0, 0, w, h);
            let blob; if (canvas.convertToBlob){ blob = await canvas.convertToBlob({ type:'image/jpeg', quality: 0.82 }); }
            else { blob = await new Promise(res=>canvas.toBlob(b=>res(b),'image/jpeg',0.82)); }
            try { bmp.close && bmp.close(); } catch(_){ }
            if (!blob) return await fallbackResizeToDataURL(file, maxW, maxH);
            return await blobToDataURL(blob);
          } catch(e){ try { bmp.close && bmp.close(); } catch(_){ } return await fallbackResizeToDataURL(file, maxW, maxH); }
        }
      }
      return await fallbackResizeToDataURL(file, maxW, maxH);
    }
    async function fallbackResizeToDataURL(file, maxW, maxH){
      const img = document.createElement('img'); const dataUrl = await fileToDataURL(file); await new Promise(res=>{ img.onload=res; img.src=dataUrl; });
      let {width:w, height:h} = img; const ratio = Math.min(maxW/w, maxH/h, 1); w=Math.max(1, Math.round(w*ratio)); h=Math.max(1, Math.round(h*ratio));
      const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h; const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h); return canvas.toDataURL('image/jpeg', 0.82);
    }
    function blobToDataURL(blob){ return new Promise((res, rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result||'')); r.onerror=()=>rej(r.error||new Error('blobToDataURL error')); r.readAsDataURL(blob); }); }
    function fileToDataURL(file){ return new Promise((res, rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result||'')); r.onerror=()=>rej(r.error||new Error('fileToDataURL error')); r.readAsDataURL(file); }); }

    // ===== Торговые точки =====
    const outSpinner = document.getElementById('outSpinner');
    const outProgWrap = document.getElementById('outProgressWrap');
    const outProg = document.getElementById('outProgress');
    const outImportBtn = document.getElementById('outImportBtn');
    const outTemplateBtn = document.getElementById('outTemplateBtn');
    const outExportBtn = document.getElementById('outExportBtn');
    const outClearBtn = document.getElementById('outClearBtn');

    const updateOutProgress = (p)=>{ if (!outProgWrap||!outProg) return; outProgWrap.classList.remove('hidden'); outProg.style.width = Math.min(100, Math.max(0, p)) + '%'; if (p>=100) setTimeout(()=>outProgWrap.classList.add('hidden'), 600); };

    outTemplateBtn?.addEventListener('click', async ()=>{
      const headers = ['Направление продаж','Код клиента','Наименование','ИНН','Адрес','Условия оплаты','Кредитный лимит','Задолженность'];
      await downloadExcelTemplate(headers, 'Точки', 'template_outlets');
    });

    outExportBtn?.addEventListener('click', async ()=>{
      if (!await requireXLSX()) return;
      try {
        const items = await Storage.getAll('outlets');
        const headers = ['Направление продаж','Код клиента','Наименование','ИНН','Адрес','Условия оплаты','Кредитный лимит','Задолженность'];
        const rows = items.map(o=>[o.direction||'', o.code||'', o.name||'', o.inn||'', o.address||'', o.paymentTerms||'', o.creditLimit||'', o.debt||'']);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Точки'); Utils.saveWorkbookXLSX(wb, 'outlets.xlsx'); Utils.showToast('Экспорт точек выполнен', 'success');
      } catch(e){ console.error('outExportBtn error', e); Utils.showToast('Ошибка экспорта точек', 'error'); }
    });

    outImportBtn?.addEventListener('click', ()=>{
      const input = document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls';
      input.onchange = async ()=>{
        const file = input.files[0]; if (!file) return;
        outSpinner?.classList.remove('hidden'); updateOutProgress(0);
        try{
          const json = await readExcelToJson(file);
          let idx=0; const total=json.length||1; let count=0;
          for (const row of json){ idx++; const code = String(row['Код клиента']||row['Код точки']||'').trim(); if (!code){ updateOutProgress(Math.round(idx/total*100)); continue; }
            const outlet = { code, direction: row['Направление продаж']||row['Направление']||'', name: row['Наименование']||row['Название']||'', inn: String(row['ИНН']||'').trim(), address: row['Адрес']||'', paymentTerms: row['Условия оплаты']||row['Форма оплаты']||'', creditLimit: row['Кредитный лимит']||'', debt: row['Задолженность']||'' };
            await Storage.put('outlets', outlet); count++; updateOutProgress(Math.round(idx/total*100)); }
          Utils.showToast(`Импорт точек завершен: ${count}`, 'success'); await refreshAdminCounts();
        } catch(e){ console.error('outImportBtn error', e); Utils.showToast(String(e?.message||'Ошибка импорта точек'), 'error'); }
        finally { outSpinner?.classList.add('hidden'); setTimeout(()=>updateOutProgress(100), 50); }
      };
      input.click();
    });

    outClearBtn?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('Очистка', 'Очистить все точки?', [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]);
      if (!ok) return; await Storage.clearStore('outlets'); await refreshAdminCounts(); Utils.showToast('Точки очищены', 'info');
    });

    // ===== Контакты =====
    const contSpinner = document.getElementById('contSpinner');
    const contProgWrap = document.getElementById('contProgressWrap');
    const contProg = document.getElementById('contProgress');
    const contImportBtn = document.getElementById('contImportBtn');
    const contTemplateBtn = document.getElementById('contTemplateBtn');
    const contClearBtn = document.getElementById('contClearBtn');

    const updateContProgress = (p)=>{ if (!contProgWrap||!contProg) return; contProgWrap.classList.remove('hidden'); contProg.style.width = Math.min(100, Math.max(0, p)) + '%'; if (p>=100) setTimeout(()=>contProgWrap.classList.add('hidden'), 600); };

    contTemplateBtn?.addEventListener('click', async ()=>{ const headers = ['Код точки','ФИО','Телефон']; await downloadExcelTemplate(headers,'Контакты','template_contacts'); });

    contImportBtn?.addEventListener('click', ()=>{
      const input = document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls';
      input.onchange = async ()=>{
        const file = input.files[0]; if (!file) return; contSpinner?.classList.remove('hidden'); updateContProgress(0);
        try{
          const json = await readExcelToJson(file);
          const byCode = new Map(); let idx=0; const total=json.length||1;
          for (const row of json){ idx++; const code = String(row['Код точки']||row['Код клиента']||'').trim(); if (!code){ updateContProgress(Math.round(idx/total*100)); continue; }
            const contact = { name: row['ФИО']||row['Контакт']||'', phone: row['Телефон']||row['Тел.']||'' }; if (!byCode.has(code)) byCode.set(code, []); byCode.get(code).push(contact); updateContProgress(Math.round(idx/total*100)); }
          for (const [code, list] of byCode){ await Storage.put('contacts', { code, list }); }
          Utils.showToast(`Импорт контактов завершен: точек ${byCode.size}`, 'success'); await refreshAdminCounts();
        } catch(e){ console.error('contImportBtn error', e); Utils.showToast(String(e?.message||'Ошибка импорта контактов'), 'error'); }
        finally { contSpinner?.classList.add('hidden'); setTimeout(()=>updateContProgress(100), 50); }
      }; input.click();
    });

    contClearBtn?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('Очистка', 'Очистить все контакты?', [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]);
      if (!ok) return; await Storage.clearStore('contacts'); await refreshAdminCounts(); Utils.showToast('Контакты очищены', 'info');
    });

    // ===== ПРОМО =====
    const promoSpinner = document.getElementById('promoSpinner');
    const promoImportBtn = document.getElementById('promoImportBtn');
    const promoTemplateBtn = document.getElementById('promoTemplateBtn');
    const promoExportBtn = document.getElementById('promoExportBtn');
    const promoClearBtn = document.getElementById('promoClearBtn');

    function excelDateToJSDate(n){ const ms = Math.round((Number(n) - 25569) * 86400 * 1000); const d=new Date(ms); return isNaN(d)? null : d; }
    function parseMaybeDate(v){ if (!v) return null; if (typeof v==='number') return excelDateToJSDate(v); const s=String(v).trim(); const m=s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/); if (m){ const dd=+m[1], mm=+m[2]-1, yy=+m[3]<100?2000+ +m[3]:+m[3]; return new Date(yy,mm,dd); } const d=new Date(s); return isNaN(d)? null : d; }

    promoTemplateBtn?.addEventListener('click', async ()=>{
      const headers = ['ID акции','Название акции','Тип','Условия','Штрихкоды товаров','Количество каждого','Скидка %','Активна (да/нет)','Дата начала','Дата окончания','Обложка (URL)'];
      const exampleRows = [
        ['PR-001','Горячий кофе — купи 2 и получи скидку','купи_получи','Купи 2 шт. — скидка 10%','4601234567890','2','10','да','2025-01-01','2025-01-31','https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80'],
        ['PR-002','Эксклюзивные скидки — набор','набор','Скидка 7% при покупке всего набора','4601234567890;4600987654321','1;2','7','да','2025-02-01','2025-02-28','https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80']
      ];
      await downloadExcelTemplate(headers, 'ПРОМО', 'template_promos', exampleRows);
    });

    promoImportBtn?.addEventListener('click', ()=>{
      const input=document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls';
      input.onchange = async ()=>{
        const file=input.files[0]; if(!file) return; promoSpinner?.classList.remove('hidden');
        try{
          const json = await readExcelToJson(file);
          let imported = 0;
          const getCell = (row,name)=>{ const target=String(name||'').trim().toLowerCase(); const key=Object.keys(row||{}).find(k=>String(k||'').trim().toLowerCase()===target); return key? row[key] : row[name]; };
          for(const row of json){
            const id=String(row['ID акции']||row['ID']||'').trim() || Utils.generateId('promo');
            const name=row['Название акции']||row['Название']||'';
            const type=row['Тип']||'';
            const itemsRaw=String(row['Штрихкоды товаров']||row['Штрихкоды']||row['Штрихкод']||'').trim();
            const qtyRaw=String(row['Количество каждого']||row['Количество']||'').trim();
            const barcodes=itemsRaw? itemsRaw.split(/[;,]/).map(s=>s.trim()).filter(Boolean):[];
            const qtys=qtyRaw? qtyRaw.split(/[;,]/).map(s=>Number(String(s).trim().replace(',','.')||'0')):[];
            const items=barcodes.map((barcode,idx)=>({ barcode, requiredQty: Number(qtys[idx]||1) }));
            const discountPercent=Number(String(row['Скидка %']||row['Скидка']||0).toString().replace(',','.')||0);
            const active = String(row['Активна (да/нет)']||row['Активна']||'да').toLowerCase().includes('да');
            const startRaw = getCell(row,'Дата начала');
            const endRaw = getCell(row,'Дата окончания');
            const startDate = parseMaybeDate(startRaw);
            const endDate = parseMaybeDate(endRaw);
            const coverUrl = row['Обложка (URL)'] || row['coverUrl'] || '';
            if (!items.length || !type){ continue; }
            await Storage.put('promos', { id, name, type, items, discountPercent, active, startDate: startDate? startDate.toISOString().slice(0,10):null, endDate: endDate? endDate.toISOString().slice(0,10):null, coverUrl });
            imported++;
          }
          const all = await Storage.getAll('promos').catch(()=>[]);
          const activeNow = PromoEngine.getActive(all).length;
          Utils.showToast(`ПРОМО импортировано: ${imported}. Активных сейчас: ${activeNow}`, 'success');
          await refreshAdminCounts();
        } catch(e){ console.error('promoImportBtn error', e); Utils.showToast(String(e?.message||'Ошибка импорта ПРОМО'), 'error'); }
        finally { promoSpinner?.classList.add('hidden'); }
      }; input.click();
    });

    promoExportBtn?.addEventListener('click', async ()=>{
      if (!await requireXLSX()) return;
      try {
        const list = await Storage.getAll('promos').catch(()=>[]);
        const headers = ['ID акции','Название акции','Тип','Условия','Штрихкоды товаров','Количество каждого','Скидка %','Активна (да/нет)','Дата начала','Дата окончания','Обложка (URL)'];
        const rows = list.map(p=>[
          p.id||'', p.name||'', p.type||'', p.condition||p.conditions||'', (p.items||[]).map(i=>i.barcode||i.sku||'').join(';'), (p.items||[]).map(i=>i.requiredQty).join(';'), p.discountPercent||0, p.active!==false?'да':'нет', p.startDate||'', p.endDate||'', p.coverUrl||''
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'ПРОМО'); Utils.saveWorkbookXLSX(wb, 'promos.xlsx'); Utils.showToast('Экспорт ПРОМО выполнен', 'success');
      } catch(e){ console.error('promoExportBtn error', e); Utils.showToast('Ошибка экспорта ПРОМО', 'error'); }
    });

    promoClearBtn?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('Очистка ПРОМО', 'Удалить все акции?', [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]); if(!ok) return; await Storage.clearStore('promos'); Utils.showToast('ПРОМО очищено', 'info'); await refreshAdminCounts();
    });

    document.getElementById('promoHelpBtn')?.addEventListener('click', async ()=>{
      const c=document.createElement('div');
      c.innerHTML = `
        <div class="text-sm space-y-3">
          <div class="fw-semibold">Как работают ПРОМО</div>
          <div>
            Поддерживаются типы: <b>купи_получи</b> и <b>набор</b>. В шаблоне используйте <b>штрихкоды</b> товаров.
            <div class="rounded border bg-gray-50 p-2 mt-2">
              <div class="fw-semibold mb-1">Шаблон Excel (колонки)</div>
              ID акции | Название акции | Тип | Условия | <b>Штрихкоды товаров</b> | Количество каждого | Скидка % | Активна (да/нет) | Дата начала | Дата окончания | Обложка (URL)
            </div>
            <div class="rounded border p-2 mt-2">
              <div class="fw-semibold mb-1">Пример 1 — «купи_получи»</div>
              <pre class="bg-gray-50 p-2 mt-2 overflow-auto"><code>
ID акции           PR-001
Название акции     Купи 2 — скидка 10%
Тип                купи_получи
Условия            Купи 2 шт. — скидка 10%
Штрихкоды товаров  4601234567890
Количество каждого 2
Скидка %           10
Активна (да/нет)   да
Дата начала        2025-01-01
Дата окончания     2025-01-31
              </code></pre>
            </div>
            <div class="rounded border p-2 mt-2">
              <div class="fw-semibold mb-1">Пример 2 — «набор» (несколько товаров)</div>
              <pre class="bg-gray-50 p-2 mt-2 overflow-auto"><code>
ID акции           PR-002
Название акции     Набор — скидка 7%
Тип                набор
Условия            Скидка 7% при покупке всего набора
Штрихкоды товаров  4601234567890;4600987654321;4699999999999
Количество каждого 1;2;1
Скидка %           7
Активна (да/нет)   да
Дата начала        2025-02-01
Дата окончания     2025-02-28
              </code></pre>
              <div class="text-xs text-gray-500 mt-1">Колонки «Штрихкоды товаров» и «Количество каждого» заполняются синхронными списками через «;».</div>
            </div>
          </div>
        </div>`;
      await Utils.showModal('Инструкция по ПРОМО', c, [{label:'Понятно'}]);
    });

    // ===== Маршруты =====
    const routesSpinner = document.getElementById('routesSpinner');
    const routesProgWrap = document.getElementById('routesProgressWrap');
    const routesProg = document.getElementById('routesProgress');
    const routesImportBtn = document.getElementById('routesImportBtn');
    const routesTemplateBtn = document.getElementById('routesTemplateBtn');
    const routesExportBtn = document.getElementById('routesExportBtn');
    const routesViewBtn = document.getElementById('routesViewBtn');
    const routesClearBtn = document.getElementById('routesClearBtn');
    const routesClearVisitsBtn = document.getElementById('routesClearVisitsBtn');

    const updateRoutesProgress = (p)=>{ if (!routesProgWrap||!routesProg) return; routesProgWrap.classList.remove('hidden'); routesProg.style.width = Math.min(100, Math.max(0, p)) + '%'; if (p>=100) setTimeout(()=>routesProgWrap.classList.add('hidden'), 600); };

    function normalizeWeekCode(v){ return Scheduler.normalizeWeekCode(v); }
    function normalizePriority(v){ const n = numberOr(v,3); return Math.min(5, Math.max(1, Math.round(n))); }

    function rowToRoute(row){
      const outletCode = String(row['Код точки'] ?? row['Код клиента'] ?? row['Код'] ?? '').trim(); if (!outletCode) return null;
      const dayOfWeek = numberOr(row['День недели'] ?? row['День'] ?? row['DayOfWeek'], 0);
      const op = String(row['Оператор (email)'] ?? row['Оператор'] ?? row['operatorEmail'] ?? '').trim().toLowerCase();
      const freq = normalizeWeekCode(row['Частота'] ?? row['Цикл'] ?? row['frequency'] ?? '1');
      const priority = normalizePriority(row['Приоритет'] ?? 3);
      if (dayOfWeek){ return { outletCode, daysOfWeek:[dayOfWeek], operatorEmail:op, frequency:freq, priority, lastVisitDate:null, nextPlannedDate:null, updatedAt: Date.now() }; }
      // Легаси: Пн..Вс (1/0)
      const s = {
        mon: numberOr(row['Понедельник'])===1,
        tue: numberOr(row['Вторник'])===1,
        wed: numberOr(row['Среда'])===1,
        thu: numberOr(row['Четверг'])===1,
        fri: numberOr(row['Пятница'])===1,
        sat: numberOr(row['Суббота'])===1,
        sun: numberOr(row['Воскресенье'])===1
      };
      const days=[]; if (s.mon) days.push(1); if (s.tue) days.push(2); if (s.wed) days.push(3); if (s.thu) days.push(4); if (s.fri) days.push(5); if (s.sat) days.push(6); if (s.sun) days.push(7);
      return { outletCode, daysOfWeek:days, operatorEmail:op, frequency:freq, priority, lastVisitDate:null, nextPlannedDate:null, updatedAt: Date.now() };
    }

    routesTemplateBtn?.addEventListener('click', async ()=>{
      const headers = ['Код точки','День недели','Оператор (email)','Частота','Приоритет'];
      const example = ['OUT-001', 1, 'operator@bigtelesales.local', '1', 1];
      await downloadExcelTemplate(headers, 'Маршруты', 'template_routes', [example]);
    });

    routesImportBtn?.addEventListener('click', ()=>{
      const input = document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls';
      input.onchange = async ()=>{
        const file = input.files[0]; if (!file) return; routesSpinner?.classList.remove('hidden'); updateRoutesProgress(0);
        try {
          const json = await readExcelToJson(file);
          let imported = 0; let idx=0; const total=json.length||1;
          for (const row of json){ idx++; const route = rowToRoute(row); if (!route){ updateRoutesProgress(Math.round(idx/total*100)); continue; }
            const existing = await Storage.get('routes', route.outletCode).catch(()=>null);
            const mergedDays = new Set([...(existing?.daysOfWeek||[]), ...(route.daysOfWeek||[])]);
            const merged = { ...(existing||{}), ...route, daysOfWeek: Array.from(mergedDays).filter(Boolean).map(Number).sort((a,b)=>a-b), updatedAt: Date.now() };
            delete merged.dayOfWeek; await Storage.put('routes', merged); imported++; updateRoutesProgress(Math.round(idx/total*100)); }
          Utils.showToast(`Маршруты импортированы: ${imported}`, 'success'); await refreshAdminCounts(); try { await Scheduler.recalculatePlannedVisits(7); } catch(_){ }
        } catch(e){ console.error('routesImportBtn error', e); Utils.showToast(String(e?.message||'Ошибка импорта маршрутов'), 'error'); }
        finally { routesSpinner?.classList.add('hidden'); setTimeout(()=>updateRoutesProgress(100), 50); }
      }; input.click();
    });

    routesExportBtn?.addEventListener('click', async ()=>{
      if (!await requireXLSX()) return;
      try {
        const routes = await Storage.getAll('routes').catch(()=>[]);
        const headers = ['Код точки','День недели','Оператор (email)','Частота','Приоритет'];
        const rows = routes.flatMap(r=>{
          const days = (r.daysOfWeek||[]).map(Number).filter(n=>n>=1&&n<=7);
          if (!days.length) return [[r.outletCode||'', '', r.operatorEmail||'', Scheduler.normalizeWeekCode(r.frequency||'1'), r.priority||3]];
          return days.map(d=>[r.outletCode||'', d, r.operatorEmail||'', Scheduler.normalizeWeekCode(r.frequency||'1'), r.priority||3]);
        });
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Маршруты'); Utils.saveWorkbookXLSX(wb, 'routes.xlsx'); Utils.showToast('Экспорт маршрутов выполнен', 'success');
      } catch(e){ console.error('routesExportBtn error', e); Utils.showToast('Ошибка экспорта маршрутов', 'error'); }
    });

    routesClearBtn?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('Очистка маршрутов', 'Удалить все маршруты?', [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]); if (!ok) return; await Storage.clearStore('routes'); await refreshAdminCounts(); Utils.showToast('Маршруты очищены', 'info');
    });

    routesClearVisitsBtn?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('Очистить историю визитов', 'Удалить все визиты и пересоздать план на сегодня?', [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]); if (!ok) return; try { await Storage.clearStore('visits'); const baseToday = (window.TZ && TZ.todayISO && TZ.parseISODate)? TZ.parseISODate(TZ.todayISO()): new Date(); await Scheduler.generatePlannedVisits(baseToday); Utils.showToast('История визитов очищена. План на сегодня пересчитан.', 'success'); } catch(e){ Utils.showToast('Ошибка очистки визитов', 'error'); }
    });

    // ===== Материалы =====
    const addFileBtn = document.getElementById('addFileBtn');
    const addFileInput = document.getElementById('addFileInput');
    const materialsTableBody = document.getElementById('materialsTableBody');

    async function renderMaterials(){
      const rec = await Storage.get('settings', 'materials').catch(()=>null);
      const items = rec?.value || [];
      if (!materialsTableBody) return;
      materialsTableBody.innerHTML='';
      if (!items.length){ materialsTableBody.innerHTML = '<tr><td class="py-2 pr-2 text-gray-500" colspan="4">Нет материалов</td></tr>'; return; }
      items.forEach((m, idx)=>{
        const tr=document.createElement('tr');
        tr.innerHTML = `
          <td class="py-2 pr-2">${esc(m.name||('Файл '+(idx+1)))}</td>
          <td class="py-2 pr-2">${m.size? Utils.humanFileSize(m.size): '—'}</td>
          <td class="py-2 pr-2">${m.createdAt? Utils.formatDate(m.createdAt,'dd.MM.yyyy'):'—'}</td>
          <td class="py-2 pr-2">
            <a href="${esc(m.url)}" target="_blank" class="text-sm text-indigo-600 hover:text-indigo-700">Открыть</a>
            <button class="ml-2 text-sm text-red-600 hover:text-red-700" data-action="del" data-idx="${idx}">Удалить</button>
          </td>`;
        materialsTableBody.appendChild(tr);
      });
    }
    await renderMaterials();

    addFileBtn?.addEventListener('click', ()=> addFileInput?.click());
    addFileInput?.addEventListener('change', async (e)=>{
      const f = e.target.files[0]; if (!f) return; const url = await fileToDataURL(f);
      const rec = await Storage.get('settings','materials').catch(()=>null) || { key:'materials', value: [] };
      rec.value.push({ name:f.name, url, size:f.size, createdAt: Date.now() }); await Storage.put('settings', rec);
      try { await window.Notifications?.createNotification?.({ type: window.Notifications?.NOTIFICATION_TYPES?.NEW_MATERIAL || 'new_material', title:'Новый материал', message: `Добавлен файл: ${f.name}`, actionUrl:'admin' }); } catch(_){ }
      Utils.showToast('Файл добавлен', 'success'); await renderMaterials();
    });

    materialsTableBody?.addEventListener('click', async (e)=>{
      const btn=e.target.closest('button[data-action="del"]'); if (!btn) return; const idx = Number(btn.getAttribute('data-idx'));
      const rec = await Storage.get('settings','materials').catch(()=>null); if (!rec) return; rec.value.splice(idx,1); await Storage.put('settings', rec); await renderMaterials();
    });

    // ===== Бэкап =====
    try { await window.Backup?.initAdminUI?.(); } catch(e){ console.warn('Backup init failed', e); }

    // ===== Верхняя панель (Схема/Инфо/Часовой пояс/Сбросить всё) =====
    document.getElementById('btnSchema')?.addEventListener('click', async ()=>{
      const div=document.createElement('div');
      div.innerHTML = `
        <div class="text-sm space-y-3">
          <div class="fw-semibold">Схема платформы Big TeleSales (что где находится)</div>
          <div class="rounded-lg border bg-gray-50 p-3">
            <div class="fw-semibold mb-1">Навигация (левая панель)</div>
            <ul class="list-disc pl-5 space-y-1">
              <li><b>Аналитика</b> — показатели визитов и заказов за период + график.</li>
              <li><b>Телевизиты</b> — список точек на дату/период, контакты, запуск визита.</li>
              <li><b>Каталог</b> — товары, поиск/фильтры, корзина, оформление заказа.</li>
              <li><b>Заказы</b> — список заказов, Excel/печать, удаление.</li>
              <li><b>Админ. панель</b> — импорт/экспорт и управление данными.</li>
            </ul>
          </div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Часовой пояс</div>Единая настройка часового пояса (по умолчанию — Москва). Применяется к датам/календарям (Телевизиты/Аналитика/Заказы).</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Маршруты и автопланирование</div>День недели: 1..7 (Пн..Вс), цикл недель: 1 / 2.1 / 2.2 / 4.1..4.4 по ISO 8601.</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">ПРОМО</div>Акции загружаются из Excel, привязка к товарам по штрихкоду, отображение в каталоге, автоматическая скидка в корзине.</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Хранилище</div>IndexedDB: users/products/productImages/outlets/contacts/orders/visits/promos/routes/notifications/activityLog/settings. localStorage: сессия/корзина/визит/автобэкапы/настройки UI.</div>
        </div>`;
      await Utils.showModal('Схема платформы', div, [{label:'OK'}]);
    });

    document.getElementById('btnInfo')?.addEventListener('click', async ()=>{
      const div=document.createElement('div');
      div.innerHTML = `
        <div class="text-sm space-y-3">
          <div class="fw-semibold">Инструкция по работе</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Оператор</div>Телевизиты → двойной клик по точке → Каталог → корзина → Отправить заказ. Завершите визит (окно с результатом).</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Каталог</div>Поиск/фильтры/ТОП SKU, плитка/таблица, корзина (сохраняется), оформление заказа (дата доставки, Клиент↔Точка, форма оплаты, кредитный лимит, комментарий).</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Телевизиты</div>Дата или период (до 3 мес), контакты, внеплановый визит, статусы (запланирован/перенос/совершен).</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Заказы</div>Просмотр, Excel, печать, автоочистка старше 3 дней.</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">ПРОМО</div>Импорт из Excel по штрихкодам; активные акции показываются в каталоге; скидки применяются автоматически при выполнении условий.</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Маршруты</div>Импорт, просмотр, экспорт; алгоритм: день (1..7) + цикл недель (1/2.1/2.2/4.1..4.4). Кнопка «Очистить историю визитов» удалит визиты и пересоздаст план на сегодня.</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Изображения</div>Импорт фото (webp/jpg/png), имя файла = SKU или Штрихкод; заглушка 1111111111.* подставится для товаров без фото. Ресайз до 800×800 для экономии места.</div>
          <div class="rounded-lg border bg-gray-50 p-3"><div class="fw-semibold mb-1">Бэкап</div>Скачать полный JSON, восстановление, авто-бэкап (3 последних копии) в localStorage.</div>
        </div>`;
      await Utils.showModal('Информация', div, [{label:'Понятно'}]);
    });

    document.getElementById('btnTimezone')?.addEventListener('click', async ()=>{
      try {
        const cur = (window.TZ?.getTimeZone?.() || 'Europe/Moscow');
        const c = document.createElement('div');
        const opts = (window.TZ?.list?.() || [{value:'Europe/Moscow', label:'Москва (Europe/Moscow)'}])
          .map(o=> `<option value="${String(o.value)}" ${String(o.value)===String(cur)?'selected':''}>${String(o.label)}</option>`).join('');
        c.innerHTML = `
          <div class="space-y-2 text-sm">
            <div class="text-gray-600">Выберите часовой пояс для всех дат/календарей платформы.</div>
            <label class="block text-sm font-medium">Часовой пояс</label>
            <select id="tzSelect" class="w-full border rounded-lg px-3 py-2">${opts}</select>
            <div class="text-xs text-gray-500">По умолчанию: Москва (Europe/Moscow).</div>
          </div>`;
        const ok = await Utils.showModal('Часовой пояс', c, [
          { label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50' },
          { label:'Сохранить', value:true, class:'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg' }
        ]);
        if (!ok) return;
        const next = c.querySelector('#tzSelect')?.value || 'Europe/Moscow';
        try { window.TZ?.setTimeZone?.(next); } catch(_){ }
        try { await Storage.put('settings', { key:'timezone', value: String(next) }); } catch(_){ }
        Utils.showToast('Часовой пояс сохранён. Перезагрузка…', 'success'); setTimeout(()=>location.reload(), 700);
      } catch(e){ console.error('btnTimezone error', e); Utils.showToast('Не удалось изменить часовой пояс', 'error'); }
    });

    document.getElementById('btnResetAll')?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('🧨 Сбросить всё',
        `<div class="text-sm space-y-2">
          <div class="text-red-600"><b>Внимание:</b> это действие удалит все данные и локальный кэш.</div>
          <ul class="list-disc pl-5"><li>Товары, фото, точки, контакты</li><li>Маршруты и история визитов</li><li>Заказы</li><li>ПРОМО и уведомления</li><li>Корзина и активный визит</li></ul>
          <div>Будут восстановлены стандартные демо‑данные.</div>
        </div>`,
        [
          {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
          {label:'Сбросить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
        ]
      );
      if (!ok) return;
      try {
        await Storage.resetAndSeed();
        try { localStorage.removeItem('bts_cart'); localStorage.removeItem('bts_visit'); localStorage.removeItem('bts_autoBackups'); localStorage.removeItem('bts_cat_view'); localStorage.removeItem('bts_cat_sort'); localStorage.removeItem('bts_cat_filters_open'); } catch(_){ }
        try { if (window.caches && typeof caches.keys==='function'){ const keys = await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); } } catch(e){ console.warn('Cache delete skipped', e); }
        try { window.AnalyticsPrecalc?.invalidate?.(); } catch(_){ }
        Utils.showToast('Все данные сброшены. Перезагрузка…', 'success'); setTimeout(()=>location.reload(), 800);
      } catch(e){ console.error('Reset all failed', e); Utils.showToast('Ошибка сброса данных', 'error'); }
    });

    // Финально обновим счётчики
    await refreshAdminCounts();
  } catch (e){
    console.error('[Admin] controller error', e);
    try { Utils.showToast('Ошибка загрузки админ-панели', 'error'); } catch(_){ }
  }
}

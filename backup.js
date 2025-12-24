/**
 * Big TeleSales — Backup module.
 * Экспорт/импорт полной резервной копии IndexedDB, а также авто-бэкап в localStorage.
 *
 * @module Backup
 */

(function(){
  'use strict';

  const AUTO_KEY = 'bts_autoBackups';

  /**
   * @returns {string}
   */
  function safeFileDate(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const HH = String(d.getHours()).padStart(2,'0');
    const MM = String(d.getMinutes()).padStart(2,'0');
    const SS = String(d.getSeconds()).padStart(2,'0');
    return `${yyyy}${mm}${dd}_${HH}${MM}${SS}`;
  }

  /**
   * Создаёт объект резервной копии.
   * @returns {Promise<Object>}
   */
  async function createBackupObject(){
    const user = await Auth.getCurrentUser().catch(()=>null);
    const createdBy = user?.email || 'unknown';
    const data = {
      users: await Storage.getAll('users').catch(()=>[]),
      products: await Storage.getAll('products').catch(()=>[]),
      productImages: await Storage.getAll('productImages').catch(()=>[]),
      outlets: await Storage.getAll('outlets').catch(()=>[]),
      contacts: await Storage.getAll('contacts').catch(()=>[]),
      routes: await Storage.getAll('routes').catch(()=>[]),
      orders: await Storage.getAll('orders').catch(()=>[]),
      visits: await Storage.getAll('visits').catch(()=>[]),
      promos: await Storage.getAll('promos').catch(()=>[]),
      notifications: await Storage.getAll('notifications').catch(()=>[]),
      settings: await Storage.getAll('settings').catch(()=>[])
    };
    return {
      version: '1.0',
      createdAt: new Date().toISOString(),
      createdBy,
      data
    };
  }

  /**
   * Скачивает полную резервную копию JSON.
   */
  async function exportFullBackup(){
    const backup = await createBackupObject();
    const json = JSON.stringify(backup, null, 2);
    const filename = `BigTeleSales_Backup_${safeFileDate()}.json`;
    Utils.downloadFile(filename, json, 'application/json');
    Utils.showToast(`Резервная копия создана: ${filename}`, 'success');
  }

  /**
   * Восстановление из объекта резервной копии.
   * @param {Object} backup
   */
  async function restoreFromObject(backup){
    if (!backup || !backup.version || !backup.data) throw new Error('Неверный формат резервной копии');

    const summary = {
      products: backup.data.products?.length || 0,
      outlets: backup.data.outlets?.length || 0,
      orders: backup.data.orders?.length || 0,
      visits: backup.data.visits?.length || 0,
      promos: backup.data.promos?.length || 0
    };

    const ok = await Utils.showModal('Восстановление из резервной копии',
      `<div class="text-sm space-y-2">
        <div>Резервная копия от: <b>${Utils.formatDate(backup.createdAt || Date.now())}</b></div>
        <div>Будут восстановлены:</div>
        <ul class="list-disc pl-5">
          <li>Товаров: <b>${summary.products}</b></li>
          <li>Точек: <b>${summary.outlets}</b></li>
          <li>Заказов: <b>${summary.orders}</b></li>
          <li>Визитов: <b>${summary.visits}</b></li>
          <li>Акций: <b>${summary.promos}</b></li>
        </ul>
        <div class="text-red-600"><b>⚠️ Текущие данные будут заменены</b></div>
      </div>`,
      [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Восстановить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]
    );
    if (!ok) return false;

    const stores = Object.keys(backup.data);
    for (const storeName of stores){
      const arr = backup.data[storeName];
      if (!Array.isArray(arr)) continue;
      await Storage.clearStore(storeName).catch(()=>{});
      for (const item of arr){
        await Storage.put(storeName, item).catch(()=>{});
      }
    }

    Utils.showToast('Данные успешно восстановлены', 'success');
    setTimeout(()=>location.reload(), 1200);
    return true;
  }

  /**
   * Импорт резервной копии из JSON файла.
   * @param {File} file
   */
  async function importBackupFile(file){
    if (!file) return false;
    const text = await file.text();
    const backup = JSON.parse(text);
    return restoreFromObject(backup);
  }

  /**
   * Получить настройки автобэкапа.
   * @returns {Promise<{enabled:boolean, intervalDays:number}>}
   */
  async function getAutoSettings(){
    const rec = await Storage.get('settings', 'autoBackup').catch(()=>null);
    const v = rec?.value;
    return {
      enabled: !!(v && v.enabled),
      intervalDays: Number(v?.intervalDays || 7) || 7
    };
  }

  /**
   * Сохранить настройки автобэкапа.
   * @param {{enabled:boolean, intervalDays:number}} s
   */
  async function setAutoSettings(s){
    await Storage.put('settings', { key:'autoBackup', value:{ enabled: !!s.enabled, intervalDays: Number(s.intervalDays||7)||7 } });
  }

  /**
   * Возвращает список авто-бэкапов из localStorage.
   * @returns {Array<{date:string, data:Object}>}
   */
  function getAutoBackups(){
    try { return JSON.parse(localStorage.getItem(AUTO_KEY) || '[]') || []; } catch(e){ return []; }
  }

  /**
   * Сохраняет список авто-бэкапов.
   * @param {Array} list
   */
  function setAutoBackups(list){
    localStorage.setItem(AUTO_KEY, JSON.stringify(list || []));
  }

  /**
   * Автоматическое резервирование (хранит последние 3 в localStorage).
   */
  async function autoBackup(){
    const s = await getAutoSettings();
    if (!s.enabled) return;

    const last = await Storage.get('settings', 'lastBackupDate').catch(()=>null);
    const lastDate = last?.value ? new Date(last.value) : null;
    const now = new Date();

    if (lastDate && isFinite(lastDate.getTime())){
      const daysSince = (now.getTime() - lastDate.getTime()) / 86400000;
      if (daysSince < s.intervalDays) return;
    }

    const backup = await createBackupObject();
    const list = getAutoBackups();
    list.unshift({ date: now.toISOString(), data: backup });
    while (list.length > 3) list.pop();
    setAutoBackups(list);

    await Storage.put('settings', { key:'lastBackupDate', value: now.toISOString() });
    console.log('Автобэкап создан');
  }

  let autoTimer = null;
  function startAutoBackup(){
    if (autoTimer) clearInterval(autoTimer);
    // Проверяем раз в 6 часов, чтобы не грузить приложение
    autoTimer = setInterval(()=>{ autoBackup().catch(()=>{}); }, 6*60*60*1000);
  }

  function stopAutoBackup(){ if (autoTimer) { clearInterval(autoTimer); autoTimer=null; } }

  /**
   * Инициализация UI в Админ-панели.
   */
  async function initAdminUI(){
    const exportBtn = document.getElementById('backupExportBtn');
    const importBtn = document.getElementById('backupImportBtn');
    const importInput = document.getElementById('backupImportInput');

    const enabledEl = document.getElementById('autoBackupEnabled');
    const intervalEl = document.getElementById('autoBackupInterval');
    const listEl = document.getElementById('autoBackupsList');

    exportBtn?.addEventListener('click', ()=> exportFullBackup().catch(e=>{ console.error(e); Utils.showToast('Ошибка создания резервной копии', 'error'); }));
    importBtn?.addEventListener('click', ()=> importInput?.click());
    importInput?.addEventListener('change', async ()=>{
      const file = importInput.files?.[0];
      if (!file) return;
      try { await importBackupFile(file); }
      catch(e){ console.error(e); Utils.showToast('Ошибка восстановления: ' + (e.message||e), 'error'); }
      finally { importInput.value=''; }
    });

    const s = await getAutoSettings();
    if (enabledEl) enabledEl.checked = s.enabled;
    if (intervalEl) intervalEl.value = String(s.intervalDays);

    enabledEl?.addEventListener('change', async ()=>{
      await setAutoSettings({ enabled: enabledEl.checked, intervalDays: Number(intervalEl?.value||7)||7 });
      Utils.showToast('Настройки автобэкапа сохранены', 'success');
    });
    intervalEl?.addEventListener('change', async ()=>{
      await setAutoSettings({ enabled: !!(enabledEl?.checked), intervalDays: Number(intervalEl.value||7)||7 });
      Utils.showToast('Настройки автобэкапа сохранены', 'success');
    });

    // Render list
    function renderList(){
      if (!listEl) return;
      const list = getAutoBackups();
      listEl.innerHTML = '';
      if (!list.length){
        listEl.innerHTML = '<div class="text-sm text-gray-500">Автобэкапы отсутствуют</div>';
        return;
      }
      list.forEach((b, idx)=>{
        const row = document.createElement('div');
        row.className = 'border rounded-lg p-2 mb-2 text-sm';
        row.innerHTML = `
          <div class="d-flex align-items-center justify-content-between gap-2">
            <div>
              <div class="fw-semibold">Локальная копия #${idx+1}</div>
              <div class="text-muted small">${Utils.formatDate(b.date)}</div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button class="border px-3 py-1 rounded-lg text-sm hover:bg-gray-50" data-dl="${idx}">📥 Скачать</button>
              <button class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-sm" data-restore="${idx}">↩️ Восстановить</button>
            </div>
          </div>
        `;
        row.addEventListener('click', async (e)=>{
          const dl = e.target.closest('button[data-dl]');
          const rs = e.target.closest('button[data-restore]');
          if (dl){
            const i = Number(dl.getAttribute('data-dl'));
            const item = getAutoBackups()[i];
            const filename = `BigTeleSales_AutoBackup_${safeFileDate()}.json`;
            Utils.downloadFile(filename, JSON.stringify(item.data, null, 2), 'application/json');
          }
          if (rs){
            const i = Number(rs.getAttribute('data-restore'));
            const item = getAutoBackups()[i];
            try { await restoreFromObject(item.data); } catch(err){ console.error(err); Utils.showToast('Ошибка восстановления', 'error'); }
          }
        });
        listEl.appendChild(row);
      });
    }

    renderList();
  }

  window.Backup = {
    createBackupObject,
    exportFullBackup,
    importBackupFile,
    restoreFromObject,
    autoBackup,
    startAutoBackup,
    stopAutoBackup,
    initAdminUI
  };
})();

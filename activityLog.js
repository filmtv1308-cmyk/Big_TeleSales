/**
 * Big TeleSales — Activity Log.
 * Хранит журнал действий в IndexedDB (store: activityLog).
 *
 * @module ActivityLog
 */
(function(){
  'use strict';

  /**
   * @readonly
   * @enum {string}
   */
  const LOG_ACTIONS = {
    // Авторизация
    LOGIN: 'Вход в систему',
    LOGOUT: 'Выход из системы',

    // Заказы
    ORDER_CREATED: 'Создан заказ',
    ORDER_DELETED: 'Удален заказ',
    ORDER_EXPORTED: 'Экспорт заказа',

    // Визиты
    VISIT_STARTED: 'Начат визит',
    VISIT_COMPLETED: 'Завершен визит',
    VISIT_POSTPONED: 'Перенесен визит',
    VISIT_ADDED: 'Добавлен внеплановый визит',

    // Импорт/Экспорт
    PRODUCTS_IMPORTED: 'Импорт товаров',
    OUTLETS_IMPORTED: 'Импорт точек',
    ROUTES_IMPORTED: 'Импорт маршрутов',
    BACKUP_CREATED: 'Создана резервная копия',
    BACKUP_RESTORED: 'Восстановление из копии',

    // Пользователи
    USER_CREATED: 'Создан пользователь',
    USER_DELETED: 'Удален пользователь'
  };

  /**
   * @param {string|number|Date} d
   * @returns {number}
   */
  function toTime(d){
    const t = new Date(d).getTime();
    return isFinite(t) ? t : Date.now();
  }

  /**
   * Удаляет логи старше N дней.
   * @param {number} days
   */
  async function cleanupOldLogs(days=30){
    const cutoff = Date.now() - (Number(days)||30)*24*60*60*1000;
    const all = await Storage.getAll('activityLog').catch(()=>[]);
    for (const l of all){
      const ts = toTime(l.timestamp);
      if (ts < cutoff){
        await Storage.del('activityLog', l.id).catch(()=>{});
      }
    }
  }

  /**
   * Добавляет запись в журнал.
   * @param {keyof LOG_ACTIONS|string} action
   * @param {string|null} [entity]
   * @param {string|null} [entityId]
   * @param {Object} [details]
   * @returns {Promise<void>}
   */
  async function logActivity(action, entity=null, entityId=null, details={}){
    const user = await Auth.getCurrentUser().catch(()=>null);
    const entry = {
      id: Utils.generateId('log'),
      timestamp: new Date().toISOString(),
      userEmail: user?.email || (Storage.getSession()?.email) || 'system',
      action: String(action||''),
      entity,
      entityId,
      details: details || {},
      ipAddress: null
    };
    await Storage.put('activityLog', entry).catch(()=>{});
    await cleanupOldLogs(30).catch(()=>{});
  }

  /**
   * Возвращает записи лога (по времени убыв.).
   * @returns {Promise<Array<Object>>}
   */
  async function listAll(){
    const all = await Storage.getAll('activityLog').catch(()=>[]);
    all.sort((a,b)=> toTime(b.timestamp) - toTime(a.timestamp));
    return all;
  }

  /**
   * Экспорт лога в Excel.
   * @param {Array<Object>} rows
   */
  async function exportToExcel(rows){
    const ok = await XLSXLoader.ensure().catch(()=>false);
    if (ok && window.XLSX?.utils){
      const headers = ['Дата/Время','Пользователь','Действие','Сущность','ID','Детали(JSON)'];
      const data = (rows||[]).map(r=>[
        Utils.formatDate(r.timestamp),
        r.userEmail||'',
        r.action||'',
        r.entity||'',
        r.entityId||'',
        JSON.stringify(r.details||{})
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Журнал');
      Utils.saveWorkbookXLSX(wb, 'activity_log.xlsx');
      return;
    }
    // Fallback Excel .xls (SpreadsheetML)
    const headers = ['Дата/Время','Пользователь','Действие','Сущность','ID','Детали(JSON)'];
    const data = (rows||[]).map(r=>[
      Utils.formatDate(r.timestamp),
      r.userEmail||'',
      r.action||'',
      r.entity||'',
      r.entityId||'',
      JSON.stringify(r.details||{})
    ]);
    const xml = Utils.buildExcelXmlTable(headers, data, 'Журнал');
    Utils.downloadFile('activity_log.xls', xml, 'application/vnd.ms-excel');
  }

  /**
   * Очищает лог.
   */
  async function clearAll(){
    await Storage.clearStore('activityLog').catch(()=>{});
  }

  /**
   * Инициализация UI в админке.
   */
  async function initAdminUI(){
    const table = document.getElementById('activityLogTable');
    const userSel = document.getElementById('logFilterUser');
    const actionSel = document.getElementById('logFilterAction');
    const dateInp = document.getElementById('logFilterDate');
    const applyBtn = document.getElementById('logApplyBtn');
    const exportBtn = document.getElementById('logExportBtn');
    const clearBtn = document.getElementById('logClearBtn');

    if (!table) return;

    const allUsers = await Storage.getAll('users').catch(()=>[]);
    const emails = Array.from(new Set(allUsers.map(u=>u.email).filter(Boolean))).sort();
    if (userSel){
      userSel.innerHTML = '<option value="">Все пользователи</option>';
      emails.forEach(em=>{
        const o = document.createElement('option');
        o.value = em;
        o.textContent = em;
        userSel.appendChild(o);
      });
    }

    if (actionSel){
      actionSel.innerHTML = '<option value="">Все действия</option>';
      Object.keys(LOG_ACTIONS).forEach(k=>{
        const o = document.createElement('option');
        o.value = k;
        o.textContent = LOG_ACTIONS[k];
        actionSel.appendChild(o);
      });
    }

    async function render(){
      const all = await listAll();
      const fUser = userSel?.value || '';
      const fAct = actionSel?.value || '';
      const fDate = dateInp?.value || '';

      const filtered = all.filter(r=>{
        if (fUser && String(r.userEmail||'') !== fUser) return false;
        if (fAct && String(r.action||'') !== fAct) return false;
        if (fDate){
          const iso = String(r.timestamp||'').slice(0,10);
          if (iso !== fDate) return false;
        }
        return true;
      });

      table.innerHTML = '';
      if (!filtered.length){
        table.innerHTML = '<tr><td colspan="4" class="py-2 text-gray-500">Нет записей</td></tr>';
        return;
      }
      filtered.slice(0, 500).forEach(r=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="py-2 pr-2">${Utils.formatDate(r.timestamp)}</td>
          <td class="py-2 pr-2">${r.userEmail||''}</td>
          <td class="py-2 pr-2">${LOG_ACTIONS[r.action] || r.action || ''}</td>
          <td class="py-2 pr-2"><span class="text-gray-500">${r.entity||''}</span> ${r.entityId?('<b>'+r.entityId+'</b>'):''}<br><span class="text-xs text-gray-500">${escapeHtml(JSON.stringify(r.details||{}))}</span></td>
        `;
        table.appendChild(tr);
      });
    }

    function escapeHtml(s){
      return String(s??'').replace(/[&<>"']/g, c=>({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    applyBtn?.addEventListener('click', ()=> render());
    userSel?.addEventListener('change', ()=> render());
    actionSel?.addEventListener('change', ()=> render());
    dateInp?.addEventListener('change', ()=> render());

    exportBtn?.addEventListener('click', async ()=>{
      const all = await listAll();
      const fUser = userSel?.value || '';
      const fAct = actionSel?.value || '';
      const fDate = dateInp?.value || '';
      const filtered = all.filter(r=>{
        if (fUser && String(r.userEmail||'') !== fUser) return false;
        if (fAct && String(r.action||'') !== fAct) return false;
        if (fDate && String(r.timestamp||'').slice(0,10) !== fDate) return false;
        return true;
      });
      await exportToExcel(filtered);
      Utils.showToast('Экспорт журнала выполнен', 'success');
    });

    clearBtn?.addEventListener('click', async ()=>{
      const ok = await Utils.showModal('Очистить журнал', 'Удалить все записи журнала действий?', [
        {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
      ]);
      if (!ok) return;
      await clearAll();
      Utils.showToast('Журнал очищен', 'info');
      await render();
    });

    await render();
  }

  window.ActivityLog = {
    LOG_ACTIONS,
    logActivity,
    listAll,
    cleanupOldLogs,
    exportToExcel,
    clearAll,
    initAdminUI
  };
})();

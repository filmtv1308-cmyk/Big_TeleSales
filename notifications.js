/**
 * Big TeleSales — Notifications module.
 * Хранит уведомления в IndexedDB (store: notifications) и показывает в header.
 *
 * Требования:
 * - Проверка и создание уведомлений при загрузке + каждые 30 минут
 * - Badge непрочитанных
 * - Drop-down список (последние), «Прочитать все», удаление
 * - Переход по actionUrl
 *
 * @module Notifications
 */

(function(){
  'use strict';

  /**
   * @readonly
   * @enum {string}
   */
  const NOTIFICATION_TYPES = {
    VISIT_REMINDER: 'visit_reminder',
    ORDER_CREATED: 'order_created',
    NEW_MATERIAL: 'new_material',
    PROMO_STARTED: 'promo_started',
    PROMO_ENDING: 'promo_ending',
    SYSTEM: 'system',
    ROUTE_UPDATED: 'route_updated'
  };

  /**
   * @returns {string} ISO date YYYY-MM-DD
   */
  function isoDate(d){ return new Date(d).toISOString().slice(0,10); }

  /**
   * @param {string} type
   * @returns {string}
   */
  function iconFor(type){
    switch(type){
      case NOTIFICATION_TYPES.VISIT_REMINDER: return '📅';
      case NOTIFICATION_TYPES.ORDER_CREATED: return '🧾';
      case NOTIFICATION_TYPES.NEW_MATERIAL: return '📎';
      case NOTIFICATION_TYPES.PROMO_STARTED: return '🔥';
      case NOTIFICATION_TYPES.PROMO_ENDING: return '⚠️';
      case NOTIFICATION_TYPES.ROUTE_UPDATED: return '🧭';
      default: return 'ℹ️';
    }
  }

  /**
   * @param {string|number|Date} date
   * @returns {string}
   */
  function formatTimeAgo(date){
    const ts = new Date(date).getTime();
    const diff = Date.now() - ts;
    const m = Math.floor(diff/60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин. назад`;
    const h = Math.floor(m/60);
    if (h < 24) return `${h} ч. назад`;
    const d = Math.floor(h/24);
    return `${d} дн. назад`;
  }

  /**
   * @returns {Promise<Array<Object>>}
   */
  async function listAll(){
    return (await Storage.getAll('notifications').catch(()=>[])) || [];
  }

  /**
   * @returns {Promise<number>}
   */
  async function countUnread(){
    const all = await listAll();
    return all.filter(n=>!n.read).length;
  }

  /**
   * Обновляет badge в header.
   * @returns {Promise<void>}
   */
  async function updateBadge(){
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const n = await countUnread();
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n<=0);
  }

  /**
   * Рендерит список уведомлений в dropdown.
   * @param {number} [limit]
   */
  async function renderDropdown(limit=20){
    const listEl = document.getElementById('notifList');
    if (!listEl) return;

    const all = await listAll();
    all.sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const items = all.slice(0, limit);

    listEl.innerHTML = '';
    if (!items.length){
      const empty = document.createElement('div');
      empty.className = 'px-3 py-3 text-sm text-gray-500';
      empty.textContent = 'Нет уведомлений';
      listEl.appendChild(empty);
      return;
    }

    for (const n of items){
      const row = document.createElement('div');
      row.className = `px-3 py-2 border-top text-sm ${n.read ? '' : 'bg-indigo-50/40'}`;
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <div class="d-flex align-items-start gap-2">
          <div style="width:20px">${iconFor(n.type)}</div>
          <div class="flex-grow-1 min-w-0">
            <div class="fw-semibold text-truncate">${escapeHtml(n.title || 'Уведомление')}</div>
            <div class="text-muted small" style="line-height:1.2">${escapeHtml(n.message || '')}</div>
            <div class="text-muted small">${formatTimeAgo(n.createdAt)}</div>
          </div>
          <button class="btn btn-sm btn-light" data-del="${n.id}" title="Удалить">✕</button>
        </div>
      `;
      row.addEventListener('click', async (e)=>{
        const delBtn = e.target.closest('button[data-del]');
        if (delBtn){
          e.stopPropagation();
          await deleteNotification(delBtn.getAttribute('data-del'));
          await renderDropdown(limit);
          await updateBadge();
          return;
        }
        await handleNotificationClick(n.id);
      });
      listEl.appendChild(row);
    }
  }

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, (c)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  /**
   * Создаёт уведомление с проверкой дублей (одинаковое сообщение и тип в тот же день).
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async function createNotification(data){
    const user = await Auth.getCurrentUser().catch(()=>null);
    if (!user) return;

    const today = isoDate(new Date());
    const all = await listAll();
    const exists = all.some(n =>
      n.type === data.type &&
      String(n.createdAt||'').startsWith(today) &&
      String(n.message||'') === String(data.message||'')
    );
    if (exists) return;

    const notification = {
      id: Utils.generateId('notif'),
      type: data.type || NOTIFICATION_TYPES.SYSTEM,
      title: data.title || 'Уведомление',
      message: data.message || '',
      createdAt: new Date().toISOString(),
      read: false,
      actionUrl: data.actionUrl || 'analytics',
      data: data.data || {}
    };

    await Storage.put('notifications', notification);
    await updateBadge();
  }

  /**
   * @param {string} id
   */
  async function markAsRead(id){
    const n = await Storage.get('notifications', id).catch(()=>null);
    if (!n) return;
    if (n.read) return;
    n.read = true;
    await Storage.put('notifications', n);
  }

  /**
   * Пометить все уведомления прочитанными.
   */
  async function markAllAsRead(){
    const all = await listAll();
    for (const n of all){
      if (!n.read){
        n.read = true;
        await Storage.put('notifications', n);
      }
    }
    await updateBadge();
    await renderDropdown();
  }

  /**
   * @param {string} id
   */
  async function deleteNotification(id){
    if (!id) return;
    await Storage.del('notifications', id).catch(()=>{});
  }

  /**
   * Переход по уведомлению.
   * @param {string} id
   */
  async function handleNotificationClick(id){
    const n = await Storage.get('notifications', id).catch(()=>null);
    if (!n) return;
    await markAsRead(id);
    await updateBadge();

    const url = String(n.actionUrl || '').replace(/^\//,'').trim();
    if (url){
      try {
        // Если в data есть promoId — передаем параметром
        const params = (n.data && typeof n.data === 'object') ? n.data : {};
        Router.navigate(url, params);
      } catch(e){
        // fallback: просто закрыть
      }
    }

    // Закрываем меню
    hideMenu();
  }

  /**
   * Удаляет уведомления старше N дней.
   * @param {number} days
   */
  async function cleanupOldNotifications(days=7){
    const cutoff = Date.now() - (Number(days)||7)*24*60*60*1000;
    const all = await listAll();
    for (const n of all){
      const t = new Date(n.createdAt).getTime();
      if (isFinite(t) && t < cutoff){
        await Storage.del('notifications', n.id).catch(()=>{});
      }
    }
  }

  /**
   * Проверка и создание уведомлений при загрузке приложения.
   */
  async function checkAndCreateNotifications(){
    const user = await Auth.getCurrentUser().catch(()=>null);
    if (!user) return;

    const todayISO = isoDate(new Date());

    // 1) Напоминание о визитах на сегодня
    const visits = await Storage.getAll('visits').catch(()=>[]);
    const todayVisits = (visits||[]).filter(v =>
      String(v.plannedDate||'') === todayISO &&
      (v.status === 'запланирован' || v.status === 'planned') &&
      String(v.operatorEmail||v.operator||'').toLowerCase() === String(user.email||'').toLowerCase()
    );
    if (todayVisits.length > 0){
      await createNotification({
        type: NOTIFICATION_TYPES.VISIT_REMINDER,
        title: 'Визиты на сегодня',
        message: `У вас ${todayVisits.length} запланированных визитов`,
        actionUrl: 'televisits'
      });
    }

    // 2) Акции, которые начинаются сегодня
    const promos = await Storage.getAll('promos').catch(()=>[]);
    const starting = (promos||[]).filter(p => p.active !== false && p.startDate && String(p.startDate) === todayISO);
    for (const p of starting){
      await createNotification({
        type: NOTIFICATION_TYPES.PROMO_STARTED,
        title: 'Началась акция',
        message: `«${p.name||p.id}» началась сегодня`,
        actionUrl: 'catalog',
        data: { promoId: p.id }
      });
    }

    // 3) Акции, которые заканчиваются завтра
    const tomorrow = Scheduler?.addDays ? Scheduler.addDays(new Date(), 1) : new Date(Date.now()+86400000);
    const tomorrowISO = isoDate(tomorrow);
    const ending = (promos||[]).filter(p => p.active !== false && p.endDate && String(p.endDate) === tomorrowISO);
    for (const p of ending){
      await createNotification({
        type: NOTIFICATION_TYPES.PROMO_ENDING,
        title: 'Акция заканчивается',
        message: `«${p.name||p.id}» завершится завтра`,
        actionUrl: 'catalog',
        data: { promoId: p.id }
      });
    }

    await cleanupOldNotifications(7);
    await updateBadge();
  }

  let autoTimer = null;

  /**
   * Инициализация UI (header).
   */
  function initUI(){
    const btn = document.getElementById('notifBtn');
    const menu = document.getElementById('notifMenu');
    const markAll = document.getElementById('notifMarkAll');
    const allBtn = document.getElementById('notifAllBtn');

    if (!btn || !menu) return;

    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      menu.classList.toggle('hidden');
      if (!menu.classList.contains('hidden')){
        await renderDropdown();
        await updateBadge();
      }
    });

    markAll?.addEventListener('click', async (e)=>{
      e.stopPropagation();
      await markAllAsRead();
      Utils.showToast('Все уведомления прочитаны', 'success');
    });

    allBtn?.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const all = await listAll();
      all.sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const cont = document.createElement('div');
      cont.innerHTML = all.length ? all.map(n=>
        `<div class="border rounded-lg p-2 mb-2 ${n.read?'':'bg-indigo-50/40'}">
          <div class="d-flex align-items-start gap-2">
            <div style="width:20px">${iconFor(n.type)}</div>
            <div class="flex-grow-1">
              <div class="fw-semibold">${escapeHtml(n.title||'Уведомление')}</div>
              <div class="text-muted small">${escapeHtml(n.message||'')}</div>
              <div class="text-muted small">${formatTimeAgo(n.createdAt)}</div>
            </div>
          </div>
        </div>`
      ).join('') : '<div class="text-sm text-gray-500">Нет уведомлений</div>';

      await Utils.showModal('Все уведомления', cont, [
        {label:'Прочитать все', value:'mark', class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
        {label:'Закрыть', value:false, class:'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg'}
      ]).then(async (v)=>{
        if (v === 'mark') await markAllAsRead();
      });
      hideMenu();
    });

    document.addEventListener('click', (e)=>{
      if (!menu.contains(e.target) && e.target !== btn){
        menu.classList.add('hidden');
      }
    });
  }

  function hideMenu(){
    const menu = document.getElementById('notifMenu');
    menu?.classList.add('hidden');
  }

  /**
   * Запускает периодическую проверку (каждые 30 минут).
   */
  function startAutoCheck(){
    stopAutoCheck();
    autoTimer = setInterval(()=>{
      checkAndCreateNotifications().catch(()=>{});
    }, 30*60*1000);
  }

  function stopAutoCheck(){
    if (autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  }

  // Export API
  window.Notifications = {
    NOTIFICATION_TYPES,
    initUI,
    updateBadge,
    renderDropdown,
    createNotification,
    checkAndCreateNotifications,
    startAutoCheck,
    stopAutoCheck,
    markAllAsRead,
    deleteNotification,
    handleNotificationClick
  };
})();

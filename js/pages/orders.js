// js/pages/orders.js
// Full Orders page controller (Stage 3: moved out of index.html)
// Depends on global modules: Storage, Utils, XLSXLoader, Print, ActivityLog

export default async function orders(params = {}){
  const listEl = document.getElementById('ordList') || document.getElementById('ordersList');
  const searchInp = document.getElementById('ordSearch') || document.getElementById('ordersSearch');
  const exportAllBtn = document.getElementById('ordExportAll') || document.getElementById('exportAllOrdersBtn');
  const deleteAllBtn = document.getElementById('ordDeleteAll') || document.getElementById('clearAllOrdersBtn');

  // Best-effort: warm up XLSX in background (don’t block UI, don’t show toasts here)
  try { window.XLSXLoader?.ensure?.().catch(()=>{}); } catch(_){ }

  // Auto purge orders older than 3 days
  const now = Date.now();
  const allExisting = await window.Storage.getAll('orders').catch(()=>[]);
  const threeDays = 3*24*60*60*1000;
  let removed = 0;
  for (const o of (allExisting||[])){
    if ((now - (o.date||0)) > threeDays){
      await window.Storage.del('orders', o.id).catch(()=>{});
      removed++;
    }
  }
  if (removed>0) window.Utils.showToast(`Удалено ${removed} устаревших заказов`, 'info');

  // Backfill barcodes for old orders (if items[] were created before barcode support)
  try {
    const prods = await window.Storage.getAll('products').catch(()=>[]);
    const bySku = new Map((prods||[]).map(p=>[String(p.sku||''), String(p.barcode||'').trim()]));
    const ordersNow = await window.Storage.getAll('orders').catch(()=>[]);
    for (const o of (ordersNow||[])){
      let touched = false;
      const items = (o.items||[]).map(it=>{
        const bc = String(it?.barcode ?? '').trim();
        if (bc) return it;
        const mapped = bySku.get(String(it?.sku||'')) || '';
        if (mapped){ touched = true; return { ...it, barcode: mapped }; }
        return it;
      });
      if (touched){ await window.Storage.put('orders', { ...o, items }).catch(()=>{}); }
    }
  } catch(_){ }

  /** @type {Array<any>} */
  let ordersCache = [];

  async function loadOrdersCache(){
    const orders = await window.Storage.getAll('orders').catch(()=>[]);
    orders.sort((a,b)=> (b.date||0)-(a.date||0));
    ordersCache = orders;
    const counter = document.getElementById('totalOrdersCount');
    if (counter) counter.textContent = String(orders.length);
  }

  function viewOrder(o){
    const outlet = o.outletDetails || {};
    const c=document.createElement('div');
    const rows = (o.items||[]).map((it,idx)=>`<tr><td class="py-1 pr-2">${idx+1}</td><td class="py-1 pr-2">${it.sku||''}</td><td class="py-1 pr-2">${it.barcode||''}</td><td class="py-1 pr-2">${it.name||''}</td><td class="py-1 pr-2">${it.price||0}</td><td class="py-1 pr-2">${it.qty||it.quantity||0}</td><td class="py-1 pr-2">${(Number(it.price||0)*Number(it.qty||it.quantity||0))}</td></tr>`).join('')||'';
    c.innerHTML = `
      <div class="space-y-2 text-sm">
        <div><b>Номер заказа:</b> ${o.id}</div>
        <div><b>Дата:</b> ${window.Utils.formatDate(o.date)}</div>
        <div><b>Клиент:</b> ${outlet.name||''}</div>
        <div><b>Код клиента:</b> ${outlet.code||o.outlet||''}</div>
        <div><b>ИНН:</b> ${outlet.inn||''}</div>
        <div><b>Адрес доставки:</b> ${outlet.address||''}</div>
        <div><b>Форма оплаты:</b> ${o.payment||outlet.paymentTerms||''}</div>
        ${o.deliveryDate ? `<div><b>Дата доставки:</b> ${o.deliveryDate}</div>`:''}
        <div class="border-t my-2"></div>
        <div class="overflow-auto">
          <table class="w-full text-sm"><thead><tr class="text-left text-gray-500"><th class="py-1 pr-2">№</th><th class="py-1 pr-2">Артикул</th><th class="py-1 pr-2">Штрихкод</th><th class="py-1 pr-2">Название</th><th class="py-1 pr-2">Цена</th><th class="py-1 pr-2">Кол-во</th><th class="py-1 pr-2">Сумма</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
        <div class="text-right font-medium">Итого: ${window.Utils.formatCurrency(o.total||0)}</div>
      </div>`;
    window.Utils.showModal('Просмотр заказа', c, [{label:'Закрыть', value:false}]);
  }

  function exportOrderExcel(o){
    const outlet = o.outletDetails || {};
    if (window.XLSXLoader?.isReady?.() && window.XLSX?.utils){
      const ws1 = window.XLSX.utils.aoa_to_sheet([
        ['Поле','Значение'],
        ['Номер заказа', o.id],
        ['Дата', window.Utils.formatDate(o.date)],
        ['Дата доставки', o.deliveryDate||''],
        ['Клиент', outlet.name||''],
        ['Код клиента', outlet.code||o.outlet||''],
        ['ИНН', outlet.inn||''],
        ['Адрес доставки', outlet.address||''],
        ['Форма оплаты', o.payment||outlet.paymentTerms||'']
      ]);
      const ws2 = window.XLSX.utils.aoa_to_sheet([
        ['№','Артикул','Штрихкод','Название','Цена','Кол-во','Сумма'],
        ... (o.items||[]).map((it,idx)=>[idx+1, it.sku||'', it.barcode||'', it.name||'', it.price||0, it.qty||it.quantity||0, (Number(it.price||0)*Number(it.qty||it.quantity||0))])
      ]);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws1, 'Заголовок');
      window.XLSX.utils.book_append_sheet(wb, ws2, 'Товары');
      window.Utils.saveWorkbookXLSX(wb, `order_${o.id}.xlsx`);
      try { window.ActivityLog?.logActivity?.(window.ActivityLog.LOG_ACTIONS.ORDER_EXPORTED, 'orders', o.id, { type:'single' }); } catch(_){ }
      return;
    }
    // Fallback: Excel-compatible .xls (SpreadsheetML)
    const headers = ['Заказ','Дата','Дата доставки','Код точки','Точка','ИНН','Адрес','Оплата','Артикул','Штрихкод','Название','Цена','Кол-во','Сумма'];
    const rows = [];
    (o.items||[]).forEach(it=>{
      rows.push([
        o.id||'',
        window.Utils.formatDate(o.date),
        o.deliveryDate||'',
        outlet.code||o.outlet||'',
        outlet.name||'',
        outlet.inn||'',
        outlet.address||'',
        o.payment||outlet.paymentTerms||'',
        it.sku||'',
        it.barcode||'',
        it.name||'',
        String(it.price||''),
        String(it.qty||it.quantity||''),
        String((Number(it.price||0)*Number(it.qty||it.quantity||0)))
      ]);
    });
    const xml = window.Utils.buildExcelXmlTable(headers, rows, 'Заказ');
    window.Utils.downloadFile(`order_${o.id}.xls`, xml, 'application/vnd.ms-excel');
  }

  async function deleteOrder(o){
    const ok = await window.Utils.showModal('Удаление', `Удалить заказ ${o.id}?`, [
      {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
      {label:'Удалить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
    ]);
    if (!ok) return;
    await window.Storage.del('orders', o.id).catch(()=>{});
    try { await window.ActivityLog?.logActivity?.(window.ActivityLog.LOG_ACTIONS.ORDER_DELETED, 'orders', o.id, {}); } catch(_){ }
    window.Utils.showToast('Заказ удален', 'info');
    await loadOrdersCache();
    await render();
  }

  function renderCard(o){
    const div=document.createElement('div');
    div.className='bg-white border rounded-xl p-4 shadow-sm order-item';
    const outlet = o.outletDetails || {};
    div.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-medium">📋 Заказ #${o.id}</div>
        <div class="text-sm text-gray-500">${window.Utils.formatDate(o.date)}</div>
      </div>
      <div class="mt-2 text-sm">
        <div class="font-medium truncate">🏪 ${outlet.name||'—'}</div>
        <div>Код: ${outlet.code||o.outlet||'—'} │ ИНН: ${outlet.inn||'—'}</div>
        <div class="truncate">📍 ${outlet.address||'—'}</div>
        <div>💳 ${o.payment||outlet.paymentTerms||'—'}</div>
        ${o.deliveryDate ? `<div class="text-gray-500 text-xs mt-1">🚚 Доставка: <b>${o.deliveryDate}</b></div>`:''}
      </div>
      <div class="my-2 border-t"></div>
      <div class="text-sm">Позиций: ${o.items?.length||0} │ Сумма: ${window.Utils.formatCurrency(o.total||0)}</div>
      <div class="mt-2 flex items-center gap-2 flex-wrap">
        <button data-act="view" class="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">👁️ Просмотр</button>
        <button data-act="excel" class="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">📥 Excel</button>
        <button data-act="print" class="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50"><i class="bi bi-printer"></i> Печать</button>
        <button data-act="del" class="border px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 text-red-600">🗑️ Удалить</button>
      </div>`;

    // Important: keep handler synchronous for downloads
    div.addEventListener('click', (e)=>{
      const btn=e.target.closest('button[data-act]');
      if(!btn) return;
      const act=btn.dataset.act;
      if (act==='view') return viewOrder(o);
      if (act==='excel') return exportOrderExcel(o);
      if (act==='print') {
        try { window.Print?.printOrder?.(o.id); } catch(_){ }
        return;
      }
      if (act==='del') {
        deleteOrder(o);
        return;
      }
    });
    return div;
  }

  async function render(){
    if (!listEl) return;
    const q = String((searchInp?.value)||'').toLowerCase().trim();
    const filtered = (ordersCache||[]).filter(o=>{
      if(!q) return true;
      const outlet=o.outletDetails||{};
      const hay=[o.id, outlet.name, outlet.code, outlet.inn, outlet.address].map(x=>String(x||'').toLowerCase()).join(' ');
      return hay.includes(q);
    });
    listEl.innerHTML='';
    filtered.forEach(o=> listEl.appendChild(renderCard(o)) );
  }

  // Initial load
  await loadOrdersCache();
  await render();

  searchInp?.addEventListener('input', window.Utils.debounce(render, 200));

  // Export ALL (sync click handler)
  exportAllBtn?.addEventListener('click', ()=>{
    const orders = (ordersCache||[]).slice().reverse(); // older -> newer for file
    if (!orders.length){
      window.Utils.showToast('Нет заказов для выгрузки', 'warning');
      return;
    }

    if (window.XLSXLoader?.isReady?.() && window.XLSX?.utils){
      const wb = window.XLSX.utils.book_new();
      orders.forEach((o,idx)=>{
        const outlet = o.outletDetails || {};
        const ws1 = window.XLSX.utils.aoa_to_sheet([
          ['Поле','Значение'],
          ['Номер заказа', o.id],
          ['Дата', window.Utils.formatDate(o.date)],
          ['Дата доставки', o.deliveryDate||''],
          ['Клиент', outlet.name||''],
          ['Код клиента', outlet.code||o.outlet||''],
          ['ИНН', outlet.inn||''],
          ['Адрес доставки', outlet.address||''],
          ['Форма оплаты', o.payment||outlet.paymentTerms||'']
        ]);
        const ws2 = window.XLSX.utils.aoa_to_sheet([
          ['№','Артикул','Штрихкод','Название','Цена','Кол-во','Сумма'],
          ... (o.items||[]).map((it,i)=>[i+1, it.sku||'', it.barcode||'', it.name||'', it.price||0, it.qty||it.quantity||0, (Number(it.price||0)*Number(it.qty||it.quantity||0))])
        ]);
        window.XLSX.utils.book_append_sheet(wb, ws1, `Заказ_${String(idx+1).padStart(4,'0')}_Заг`);
        window.XLSX.utils.book_append_sheet(wb, ws2, `Заказ_${String(idx+1).padStart(4,'0')}_Товары`);
      });
      window.Utils.saveWorkbookXLSX(wb, 'orders_all.xlsx');
      try { window.ActivityLog?.logActivity?.(window.ActivityLog.LOG_ACTIONS.ORDER_EXPORTED, 'orders', null, { type:'all', count: orders.length }); } catch(_){ }
      return;
    }

    // Fallback: Excel-compatible .xls (single sheet)
    const headers = ['Заказ','Дата','Дата доставки','Код точки','Точка','ИНН','Адрес','Оплата','Артикул','Штрихкод','Название','Цена','Кол-во','Сумма'];
    const rows = [];
    for (const o of orders){
      const outlet = o.outletDetails || {};
      for (const it of (o.items||[])){
        rows.push([
          o.id||'',
          window.Utils.formatDate(o.date),
          o.deliveryDate||'',
          outlet.code||o.outlet||'',
          outlet.name||'',
          outlet.inn||'',
          outlet.address||'',
          o.payment||outlet.paymentTerms||'',
          it.sku||'',
          it.barcode||'',
          it.name||'',
          String(it.price||''),
          String(it.qty||it.quantity||''),
          String((Number(it.price||0)*Number(it.qty||it.quantity||0)))
        ]);
      }
    }
    const xml = window.Utils.buildExcelXmlTable(headers, rows, 'Заказы');
    window.Utils.downloadFile('orders_all.xls', xml, 'application/vnd.ms-excel');
    try { window.ActivityLog?.logActivity?.(window.ActivityLog.LOG_ACTIONS.ORDER_EXPORTED, 'orders', null, { type:'all_fallback', count: orders.length }); } catch(_){ }
  });

  deleteAllBtn?.addEventListener('click', async ()=>{
    const ok = await window.Utils.showModal('Удаление', 'Удалить все заказы?', [
      {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'},
      {label:'Удалить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'}
    ]);
    if (!ok) return;
    await window.Storage.clearStore('orders').catch(()=>{});
    window.Utils.showToast('Все заказы удалены', 'info');
    await loadOrdersCache();
    await render();
  });
}

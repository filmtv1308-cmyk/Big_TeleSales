/**
 * Big TeleSales — Print module.
 * Печать заказов, плана визитов и отчета аналитики через window.open + window.print.
 *
 * @module Print
 */
(function(){
  'use strict';

  /**
   * Безопасный HTML.
   * @param {string} s
   * @returns {string}
   */
  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, (c)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  /**
   * @param {string} title
   * @param {string} bodyHtml
   */
  function openPrintWindow(title, bodyHtml){
    const w = window.open('', '_blank', 'noopener');
    if (!w) {
      Utils.showToast('Браузер заблокировал окно печати', 'warning');
      return;
    }
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{ font-family: Arial, sans-serif; margin: 20px; color:#111; }
  h1{ font-size: 18px; margin: 0 0 6px; }
  .muted{ color:#555; font-size: 12px; }
  table{ width:100%; border-collapse: collapse; margin-top: 14px; }
  th, td{ border:1px solid #000; padding:6px 8px; font-size: 12px; }
  th{ background:#f0f0f0; }
  .right{ text-align:right; }
  .center{ text-align:center; }
  .total{ font-size: 16px; font-weight: 700; text-align:right; margin-top: 14px; }
  .signature{ display:flex; justify-content: space-between; margin-top: 48px; }
  .line{ border-top:1px solid #000; width: 220px; text-align:center; padding-top:6px; font-size:12px; }
  @media print{ .no-print{ display:none; } }
</style>
</head><body>
${bodyHtml}
<div class="no-print" style="margin-top:16px">
  <button onclick="window.print()" style="padding:8px 14px">Печать</button>
</div>
</body></html>`);
    w.document.close();
  }

  /**
   * Печать заказа.
   * @param {string} orderId
   */
  async function printOrder(orderId){
    const order = await Storage.get('orders', orderId).catch(()=>null);
    if (!order){ Utils.showToast('Заказ не найден', 'error'); return; }
    const outlet = order.outletDetails || {};

    const items = (order.items||[]).map((it,i)=>{
      const sum = (Number(it.price||0) * Number(it.qty||0));
      return `<tr>
        <td class="center">${i+1}</td>
        <td>${esc(it.sku||'')}</td>
        <td>${esc(it.name||'')}</td>
        <td class="center">${esc(it.qty||0)}</td>
        <td class="right">${esc(Utils.formatCurrency(it.price||0))}</td>
        <td class="right">${esc(Utils.formatCurrency(sum))}</td>
      </tr>`;
    }).join('');

    openPrintWindow(`Заказ ${order.id}`, `
      <h1>ЗАКАЗ № ${esc(order.id)}</h1>
      <div class="muted">Дата: ${esc(Utils.formatDate(order.date))}</div>
      <table style="margin-top:12px">
        <tbody>
          <tr><td><b>Клиент</b></td><td>${esc(outlet.name||'')}</td></tr>
          <tr><td><b>ИНН</b></td><td>${esc(outlet.inn||'')}</td></tr>
          <tr><td><b>Код клиента</b></td><td>${esc(outlet.code||order.outlet||'')}</td></tr>
          <tr><td><b>Адрес доставки</b></td><td>${esc(outlet.address||'')}</td></tr>
          <tr><td><b>Форма оплаты</b></td><td>${esc(order.payment||outlet.paymentTerms||'')}</td></tr>
          <tr><td><b>Оператор</b></td><td>${esc(order.operator||'')}</td></tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th style="width:40px" class="center">№</th>
            <th style="width:120px">Артикул</th>
            <th>Наименование</th>
            <th style="width:70px" class="center">Кол-во</th>
            <th style="width:110px" class="right">Цена</th>
            <th style="width:110px" class="right">Сумма</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>

      <div class="total">ИТОГО: ${esc(Utils.formatCurrency(order.total||0))}</div>
      <div class="signature">
        <div class="line">Оператор</div>
        <div class="line">Клиент</div>
      </div>
    `);

    try { await window.ActivityLog?.logActivity?.(window.ActivityLog.LOG_ACTIONS.ORDER_EXPORTED, 'orders', order.id, { print: true }); } catch(_){ }
  }

  /**
   * Печать плана визитов на день.
   * @param {string} isoDate YYYY-MM-DD
   */
  async function printDailyVisits(isoDate){
    const user = await Auth.getCurrentUser().catch(()=>null);
    const visits = await Storage.getAll('visits').catch(()=>[]);
    const list = (visits||[])
      .filter(v=> String(v.plannedDate||'') === String(isoDate||''))
      .filter(v=> user?.role==='admin' ? true : String(v.operatorEmail||v.operator||'').toLowerCase() === String(user?.email||'').toLowerCase())
      .sort((a,b)=> (Number(a.priority||99)-Number(b.priority||99)) || String(a.outletName||'').localeCompare(String(b.outletName||'')));

    const rows = list.map(v=>{
      return `<tr>
        <td class="center" style="width:40px"><div style="width:18px;height:18px;border:2px solid #000"></div></td>
        <td>${esc(v.outlet||v.outletCode||'')}</td>
        <td>${esc(v.outletName||'')}</td>
        <td>${esc(v.address||'')}</td>
        <td style="width:160px"></td>
      </tr>`;
    }).join('');

    openPrintWindow(`План визитов ${isoDate}`, `
      <h1>ПЛАН ОБЗВОНА НА ${esc(isoDate)}</h1>
      <div class="muted">Оператор: ${esc(user?.email||'')}</div>
      <div class="muted">Всего точек: ${list.length}</div>

      <table>
        <thead>
          <tr>
            <th style="width:40px" class="center">✓</th>
            <th style="width:110px">Код</th>
            <th>Наименование</th>
            <th>Адрес</th>
            <th style="width:160px">Результат</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  /**
   * Печать отчета аналитики.
   * @param {{mode:string, startISO:string, endISO:string, operatorEmail?:string, html?:string}} payload
   */
  async function printAnalyticsReport(payload){
    const title = 'Отчет аналитики';
    if (payload?.html){
      openPrintWindow(title, payload.html);
      return;
    }
    openPrintWindow(title, `<h1>ОТЧЕТ АНАЛИТИКИ</h1><div class="muted">Период: ${esc(payload?.startISO||'')} — ${esc(payload?.endISO||'')}</div>`);
  }

  window.Print = { printOrder, printDailyVisits, printAnalyticsReport };
})();

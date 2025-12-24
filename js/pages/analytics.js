// js/pages/analytics.js
// Full Analytics page controller (Stage 3: moved out of index.html)
// Depends on global modules: Storage, Utils, TZ, Charts, AnalyticsPrecalc

/**
 * Render simple line chart of daily sales
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{label:string,value:number}>} data
 */
function drawTrend(canvas, data){
  try {
    if (window.Charts && typeof window.Charts.renderLineChart === 'function'){
      window.Charts.renderLineChart(canvas, data);
      return;
    }
  } catch(_){ }
  // Fallback mini renderer
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.clientWidth || 600;
  const H = canvas.height = canvas.getAttribute('height') ? Number(canvas.getAttribute('height')) : 140;
  ctx.clearRect(0,0,W,H);
  const pad = 20; const max = Math.max(1, ...data.map(d=>Number(d.value||0)));
  ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(pad, H-20); ctx.lineTo(W-pad, H-20); ctx.stroke();
  ctx.strokeStyle = '#6366f1'; ctx.beginPath();
  data.forEach((d,i)=>{ const x = pad + (i/(Math.max(1,data.length-1)))*(W-pad*2); const y = H-20 - (Number(d.value||0)/max)*(H-40); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();
}

function formatCurrency(n){ return window.Utils?.formatCurrency ? window.Utils.formatCurrency(n) : (Number(n||0).toFixed(2)+' ₽'); }

function id(id){ return document.getElementById(id); }

function setText(idOrEl, text){ const el = typeof idOrEl==='string'? id(idOrEl): idOrEl; if (el) el.textContent = String(text); }

function getTodayISO(){ try { return window.TZ?.todayISO?.() || new Date().toISOString().slice(0,10); } catch(_){ return new Date().toISOString().slice(0,10); } }
function toISO(date){ try { return window.TZ?.isoDate?.(date) || new Date(date).toISOString().slice(0,10); } catch(_){ return new Date(date).toISOString().slice(0,10); } }
function parseISO(iso){ try { return window.TZ?.parseISODate?.(iso) || new Date(iso); } catch(_){ return new Date(iso); } }

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }

function inRange(ts, start, end){ const t = (new Date(ts)).getTime(); return t >= start.getTime() && t <= end.getTime(); }

export default async function analytics(params = {}){
  // Elements
  const btns = document.querySelectorAll('[data-range]');
  const startInp = id('anStart');
  const endInp = id('anEnd');
  const applyBtn = id('anApply');
  const resWrap = id('anResults');
  const chart = id('anChart');

  // Range helpers (TZ aware)
  function setRange(type){
    const todayISO = getTodayISO();
    let base = parseISO(todayISO);
    let s = new Date(base), e = new Date(base);
    if (type==='week'){ s.setDate(s.getDate()-6); }
    if (type==='month'){ s.setDate(s.getDate()-29); }
    startInp.value = toISO(s);
    endInp.value = toISO(e);
  }
  function validateSpan(){
    const s = parseISO(startInp.value);
    const e = parseISO(endInp.value);
    const maxMs = 93*24*60*60*1000; // 3 months
    if (e - s > maxMs){ window.Utils?.showToast?.('Период не должен превышать 3 месяца', 'warning'); return false; }
    return true;
  }

  // Init default range = today
  setRange('today');
  btns.forEach(b=> b.addEventListener('click', ()=>{ setRange(b.dataset.range); render(); }));
  applyBtn?.addEventListener('click', ()=>{ if (validateSpan()) render(); });

  async function render(){
    // Prepare period (TZ)
    const sDate = startOfDay(parseISO(startInp.value));
    const eDate = endOfDay(parseISO(endInp.value));

    // Data (use precalc if available)
    try { await (window.AnalyticsPrecalc?.compute?.() || Promise.resolve()); } catch(_){ }
    const orders = (await window.Storage.getAll('orders').catch(()=>[])) || [];
    const visits = (await window.Storage.getAll('visits').catch(()=>[])) || [];
    const products = (await window.Storage.getAll('products').catch(()=>[])) || [];

    const inP = (d)=> inRange(d, sDate, eDate);
    const oSel = orders.filter(o=> inP(o.date));
    const vSel = visits.filter(v=> inP(v.date));

    // KPIs: visits
    const vTotal = vSel.length;
    const vPlanned = vSel.filter(v=> v.status==='запланирован' || v.status==='planned').length;
    // Adhoc: completed visits with no planned counterpart same day/outlet
    const byKey = new Map();
    vSel.forEach(v=>{ const day = startOfDay(v.date); const key = `${day.getTime()}|${v.outlet||v.outletCode||''}`; const arr = byKey.get(key)||[]; arr.push(v); byKey.set(key, arr); });
    let vAdhoc = 0; byKey.forEach(arr=>{ const hasPlan = arr.some(x=>x.status==='запланирован' || x.status==='planned'); if (!hasPlan) vAdhoc += arr.filter(x=> x.status==='совершен' || x.status==='completed').length; });
    setText('anVisitsTotal', vTotal);
    setText('anVisitsPlanned', vPlanned);
    setText('anVisitsAdhoc', vAdhoc);

    // Results distribution (completed)
    const done = vSel.filter(v=> v.status==='совершен' || v.status==='completed');
    const dist = { order:0, noorder:0, wrong:0, noanswer:0, other:0 };
    done.forEach(v=>{ const r=v.result; if (r==='order'||r==='noorder'||r==='wrong'||r==='noanswer') dist[r]++; else dist.other++; });
    resWrap.innerHTML = '';
    const labels = [ ['✅ Заказ сделан','order'], ['❌ Без заказа','noorder'], ['📵 Неверный номер','wrong'], ['📞 Нет ответа','noanswer'], ['📝 Прочее','other'] ];
    const doneCount = Math.max(1, done.length);
    labels.forEach(([title,key])=>{
      const cnt = dist[key]||0; const pct = Math.round(cnt/doneCount*100);
      const row = document.createElement('div');
      row.className = 'mb-2';
      row.innerHTML = `<div class=\"d-flex justify-content-between\"><div>${title}</div><div>${cnt} (${pct}%)</div></div>
        <div class=\"w-100 bg-gray-100 rounded\" style=\"height:6px\"><div style=\"width:${pct}%;height:6px;background:#6366f1;border-radius:9999px\"></div></div>`;
      resWrap.appendChild(row);
    });

    // Orders sums
    const sum = oSel.reduce((s,o)=> s + (o.total||0), 0);
    const avg = oSel.length ? sum/oSel.length : 0;
    setText('anOrdersTotal', formatCurrency(sum));
    setText('anOrdersAvg', formatCurrency(avg));
    setText('anOrdersCount', String(oSel.length));

    // Distribution by unique outlets
    const uniq = new Set(oSel.map(o=> o.outlet || (o.outletDetails?.code) || ''));
    const covered = Array.from(uniq).filter(Boolean).length;
    setText('anOutletsCovered', String(covered));
    setText('anAvgPerOutlet', formatCurrency(covered? sum/covered : 0));

    // Top SKU
    const topSet = new Set(products.filter(p=> (p.topSku===1 || String(p.topSku)==='1' || p.topSku===true)).map(p=> p.sku));
    const qBySku = new Map();
    oSel.forEach(o=> (o.items||[]).forEach(it=>{ if (topSet.has(it.sku)) qBySku.set(it.sku, (qBySku.get(it.sku)||0) + Number(it.qty||it.quantity||0)); }));
    const totalTop = Array.from(qBySku.values()).reduce((a,b)=>a+b,0);
    setText('anTopSkuTotal', String(totalTop));
    setText('anTopSkuAvg', (oSel.length? String(Math.round(totalTop/oSel.length)) : '0'));
    const bySku = new Map(products.map(p=>[p.sku, p]));
    const top5 = Array.from(qBySku.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map((e,i)=> `${i+1}. ${(bySku.get(e[0])?.name)||e[0]} - ${e[1]} шт.`).join('<br/>') || '<span class=\"text-gray-500\">Недостаточно данных</span>';
    const top5El = id('anTop5'); if (top5El) top5El.innerHTML = top5;

    // Trend chart (daily)
    const days=[]; const cur=new Date(sDate); const end=new Date(eDate); cur.setHours(0,0,0,0); end.setHours(0,0,0,0);
    while(cur<=end){ const lab = toISO(cur); days.push({ label: lab, date: new Date(cur) }); cur.setDate(cur.getDate()+1); }
    const daily = days.map(d=>{
      const t0 = startOfDay(d.date).getTime(); const t1=endOfDay(d.date).getTime();
      const amount = oSel.filter(o=> (o.date>=t0 && o.date<=t1)).reduce((s,o)=>s+(o.total||0),0);
      return { label: d.label, value: amount };
    });
    if (chart) drawTrend(chart, daily);
  }

  await render();
}

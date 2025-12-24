(function(){
  /**
   * Scheduler — автопланирование визитов по маршрутам.
   * Новая модель маршрутов:
   * - route.dayOfWeek (1..7) или route.daysOfWeek: number[] (1=Пн..7=Вс)
   * - route.frequency: "1", "2.1", "2.2", "4.1".."4.4" (ISO‑недели)
   * Backward: legacy schedule{mon..sun} + text frequency → маппится в коды.
   */
  const Scheduler = (function(){
    function toISODate(d){ const x = new Date(d); const yyyy=x.getFullYear(); const mm=String(x.getMonth()+1).padStart(2,'0'); const dd=String(x.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }
    function fromISODate(iso){ const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return null; const dt = new Date(Number(m[1]), Number(m[2])-1, Number(m[3])); dt.setHours(0,0,0,0); return dt; }
    function addDays(d, days){ const x=new Date(d); x.setDate(x.getDate()+days); return x; }
    function getISODayNumber(date){ const d = new Date(date); const js = d.getDay(); return ((js + 6) % 7) + 1; }
    function getLegacyDayKey(date){ const n = new Date(date).getDay(); return ['sun','mon','tue','wed','thu','fri','sat'][n]; }
    function getISOWeek(date){ const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const dayNum = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7); return { week, year: d.getUTCFullYear() }; }
    function normalizeWeekCode(v){ const s0 = String(v ?? '').trim().toLowerCase().replace(',', '.'); if (!s0) return '1'; if (/^(1|2\.[12]|4\.[1-4])$/.test(s0)) return s0; if (s0.includes('еж')) return '1'; if (s0.includes('2')) return '2.1'; if (s0.includes('месяц') || s0.includes('4')) return '4.1'; return '1'; }
    function matchWeekCode(isoWeekNumber, weekCode){ const code = normalizeWeekCode(weekCode); if (code === '1') return true; if (code.startsWith('2.')){ const part = code.split('.')[1]; const isOdd = (isoWeekNumber % 2) === 1; return (part === '1' && isOdd) || (part === '2' && !isOdd); } if (code.startsWith('4.')){ const part = Number(code.split('.')[1] || 1); const cycleWeek = ((isoWeekNumber - 1) % 4) + 1; return cycleWeek === part; } return true; }
    function shouldVisitByFrequency(route, targetDate){ const { week } = getISOWeek(targetDate); const weekCode = route?.frequency ?? route?.weekCode ?? '1'; return matchWeekCode(week, weekCode); }
    function matchesDay(route, targetDate){ if (route && route.dayOfWeek){ return Number(route.dayOfWeek) === getISODayNumber(targetDate); } if (route && Array.isArray(route.daysOfWeek) && route.daysOfWeek.length){ return route.daysOfWeek.map(Number).includes(getISODayNumber(targetDate)); } const key = getLegacyDayKey(targetDate); return !!route?.schedule?.[key]; }
    async function generatePlannedVisits(date){ const user = await (globalThis.Auth?.getCurrentUser?.() || Promise.resolve(null)); if (!user) return; const plannedDate = (globalThis.TZ && typeof TZ.isoDate==='function') ? TZ.isoDate(date) : toISODate(date); const plannedDt = fromISODate(plannedDate) || new Date(date); plannedDt.setHours(0,0,0,0); const routes = await (globalThis.Storage?.getAll?.('routes').catch(()=>[]) || []);
      const visits = await (globalThis.Storage?.getAll?.('visits').catch(()=>[]) || []);
      for (const route of (routes||[])){
        if (!matchesDay(route, date)) continue;
        if (user.role !== 'admin' && String(route.operatorEmail||'').toLowerCase() !== String(user.email||'').toLowerCase()) continue;
        if (!shouldVisitByFrequency(route, date)) continue;
        const exists = (visits||[]).some(v => String(v.plannedDate||'')===plannedDate && String(v.outlet||v.outletCode||'')===String(route.outletCode)); if (exists) continue;
        const outlet = await (globalThis.Storage?.get?.('outlets', route.outletCode).catch(()=>null) || null) || {};
        const rec = { id: (globalThis.Utils?.generateId?.('visit') || ('visit_'+Date.now())), date: plannedDt.getTime(), plannedDate, outlet: route.outletCode, outletCode: route.outletCode, outletName: outlet.name||'', inn: outlet.inn||'', address: outlet.address||'', payment: outlet.paymentTerms||'', direction: outlet.direction||'', creditLimit: outlet.creditLimit||'', debt: outlet.debt||'', status: 'запланирован', type: 'scheduled', priority: Number(route.priority||3) || 3, operator: route.operatorEmail||user.email, operatorEmail: route.operatorEmail||user.email, duration: '-', createdAt: Date.now() };
        await globalThis.Storage?.put?.('visits', rec);
      }
    }
    async function recalculatePlannedVisits(days=7){ const start = (globalThis.TZ && TZ.parseISODate && TZ.todayISO) ? TZ.parseISODate(TZ.todayISO()) : (()=>{ const d=new Date(); d.setHours(0,0,0,0); return d; })(); for (let i=0;i<days;i++){ await generatePlannedVisits(addDays(start, i)); } }
    async function cleanupOldVisits(){ const cutoff = addDays(new Date(), -30); cutoff.setHours(0,0,0,0); const visits = await (globalThis.Storage?.getAll?.('visits').catch(()=>[]) || []); const toDel = (visits||[]).filter(v => (v.status==='запланирован' || v.status==='planned') && (v.plannedDate ? (new Date(v.plannedDate).getTime() < cutoff.getTime()) : (v.date < cutoff.getTime()))); for (const v of toDel){ try { await globalThis.Storage?.del?.('visits', v.id); } catch(e){} } if (toDel.length) globalThis.Utils?.showToast?.(`Удалено старых плановых визитов: ${toDel.length}`, 'info'); }
    return { toISODate, fromISODate, addDays, getISODayNumber, getLegacyDayKey, getISOWeek, normalizeWeekCode, matchWeekCode, matchesDay, shouldVisitByFrequency, generatePlannedVisits, recalculatePlannedVisits, cleanupOldVisits };
  })();
  window.Scheduler = Scheduler;
})();

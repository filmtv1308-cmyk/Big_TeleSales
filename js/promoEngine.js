(function(){
  /**
   * PromoEngine — утилиты для работы с акциями.
   * Переход на штрихкоды (barcode) вместо артикулов (sku) с обратной совместимостью.
   * @namespace PromoEngine
   */
  const PromoEngine = (function(){
    function normalizeType(v){
      const s = String(v||'').toLowerCase().trim();
      const x = s.replace(/[\s-]+/g, '_');
      if (x.includes('купи') && (x.includes('получи') || x.includes('2'))) return 'купи_получи';
      if (x.includes('kup') || x.includes('get')) return 'купи_получи';
      if (x.includes('набор') || x.includes('bundle') || x.includes('set')) return 'набор';
      return x;
    }
    function getActive(promos){
      const now = new Date().setHours(0,0,0,0);
      return (promos||[]).filter(p=>{
        if (p.active===false) return false;
        const s = p.startDate? (new Date(p.startDate)).setHours(0,0,0,0) : null;
        const e = p.endDate? (new Date(p.endDate)).setHours(23,59,59,999) : null;
        if (s && now < s) return false; if (e && now > e) return false; return true;
      });
    }
    function findCartItem(cart, promoItem){
      const byBarcode = (cart||[]).find(c => String(c.barcode||'').trim() && String(c.barcode).trim() === String(promoItem.barcode||'').trim());
      if (byBarcode) return byBarcode;
      return (cart||[]).find(c => String(c.sku||'').trim() && String(c.sku).trim() === String(promoItem.sku||'').trim()) || null;
    }
    function applyPromos(cart, activePromos){
      (cart||[]).forEach(it=>{ it._discountPercent=0; it._discountAmount=0; it._promoApplied=null; });
      const apply=(item, percent, name)=>{ percent = Number(percent)||0; if (!item||percent<=0) return; const disc = (item.price||0)*(item.qty||0)*percent/100; if ((item._discountAmount||0) < disc){ item._discountAmount=disc; item._discountPercent=percent; item._promoApplied=name||'АКЦИЯ'; } };
      for (const p of (activePromos||[])){
        const t = normalizeType(p.type);
        if (t==='купи_получи'){
          const it=p.items?.[0]; if (!it) continue;
          const item = findCartItem(cart, it);
          if (item && Number(item.qty||0) >= Number(it.requiredQty||1)) apply(item, p.discountPercent, p.name);
        } else if (t==='набор'){
          const all=p.items||[];
          const ok = all.length && all.every(x=>{ const i=findCartItem(cart, x); return i && Number(i.qty||0) >= Number(x.requiredQty||1); });
          if (ok){ all.forEach(x=> { const i=findCartItem(cart, x); apply(i, p.discountPercent, p.name); }); }
        }
      }
    }
    function skusMap(activePromos){
      const map = new Map();
      (activePromos||[]).forEach(p=> (p.items||[]).forEach(i=>{
        const key = String(i.barcode||i.sku||'').trim(); if (!key) return;
        const arr = map.get(key)||[]; arr.push(p); map.set(key, arr);
      }));
      return map;
    }
    return { getActive, applyPromos, skusMap, normalizeType };
  })();
  window.PromoEngine = PromoEngine;
})();

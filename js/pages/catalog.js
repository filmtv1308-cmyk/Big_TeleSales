// js/pages/catalog.js
// Full Catalog page controller (Stage 3: moved out of index.html)
// Depends on global modules: Storage, Utils, TZ, XLSXLoader, PromoEngine, VisitManager, Router

export default async function catalog(params = {}){
  // Cleanup any previous observers/timers from older page instances
  try { if (typeof window.__btsCatalogCleanup === 'function') { window.__btsCatalogCleanup(); } } catch(_) {}

  // State
  const state = {
    items: [],
    imgs: new Map(),
    filtered: [],
    view: localStorage.getItem('bts_cat_view')||'grid',
    search: params.q||'',
    topOnly: false,
    sort: localStorage.getItem('bts_cat_sort')||'sortOrder',
    filters: { vendor:new Set(), manufacturer:new Set(), category:new Set(), subcategory:new Set() },
    page: 0,
    pageSize: 30,
    cart: JSON.parse(localStorage.getItem('bts_cart')||'[]'),
    promos: [],
    activePromos: [],
    promoFilterSkus: null,
    promoActiveIdx: 0,
    promoTimer: null,
    infinite: (localStorage.getItem('bts_cat_infinite') === '1')
  };

  // Elements
  const main = document.getElementById('main-content') || document;

  // Promo wrappers
  const promoWrap = document.getElementById('promoCardsWrap');
  const promoPrev = document.getElementById('promoPrev');
  const promoNext = document.getElementById('promoNext');

  // Top bar
  const catSearch = document.getElementById('catSearch');
  const viewGridBtn = document.getElementById('viewGridBtn');
  const viewTableBtn = document.getElementById('viewTableBtn');
  const topSkuBtn = document.getElementById('topSkuBtn');
  const catInfinite = document.getElementById('catInfinite');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const sortBtn = document.getElementById('sortBtn');
  const sortMenu = document.getElementById('sortMenu');

  // Stats + lists
  const statsEl = document.getElementById('catStats');
  const gridEl = document.getElementById('catGrid');
  const tableWrap = document.getElementById('catTableWrap');
  const tableBody = document.getElementById('catTable');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  // Cart elements
  const cartOpenBtn = document.getElementById('cartOpenBtn');
  const cartBadge = document.getElementById('cartBadge');
  const cartTotalTop = document.getElementById('cartTotal');
  const cartOverlay = document.getElementById('cartOverlay');
  const cartPanel = document.getElementById('cartPanel');
  const cartCloseBtn = document.getElementById('cartCloseBtn');
  const cartBody = document.getElementById('cartBody');
  const cartTotalBottom = document.getElementById('cartTotalBottom');
  const cartExportBtn = document.getElementById('cartExportBtn');
  const cartClearBtn = document.getElementById('cartClearBtn');
  const cartCheckoutBtn = document.getElementById('cartCheckoutBtn');

  // Load data
  const prods = await window.Storage.getAll('products').catch(()=>[]);
  const imgs = await window.Storage.getAll('productImages').catch(()=>[]);
  state.items = prods || [];
  state.imgs = new Map((imgs||[]).map(i=>[i.sku, i.images||[]]));

  // Load promos from dedicated store and filter active
  const promosAll = await window.Storage.getAll('promos').catch(()=>[]);
  state.promos = promosAll || [];
  state.activePromos = window.PromoEngine.getActive(state.promos);

  // --- Dependent filters (vendor/manufacturer/category/subcategory) ---
  function recomputeFilterOptions(){
    const base = state.items;
    const f = state.filters;
    const selected = (set, val)=> set.size===0 || set.has(String(val||'').trim());
    function matchesExcept(p, excludeKey){
      if (excludeKey !== 'vendor' && !selected(f.vendor, p.vendor)) return false;
      if (excludeKey !== 'manufacturer' && !selected(f.manufacturer, p.manufacturer)) return false;
      if (excludeKey !== 'category' && !selected(f.category, p.category)) return false;
      if (excludeKey !== 'subcategory' && !selected(f.subcategory, p.subcategory)) return false;
      return true;
    }
    const sets = { vendor: new Map(), manufacturer:new Map(), category:new Map(), subcategory:new Map() };
    const allVals = { vendor: new Set(), manufacturer:new Set(), category:new Set(), subcategory:new Set() };
    const incr=(map,key)=>{ if (key===null||key===undefined) return; const k=String(key).trim(); if(!k) return; map.set(k,(map.get(k)||0)+1); };
    base.forEach(p=>{
      const v = String(p.vendor||'').trim(); if (v) allVals.vendor.add(v);
      const m = String(p.manufacturer||'').trim(); if (m) allVals.manufacturer.add(m);
      const c = String(p.category||'').trim(); if (c) allVals.category.add(c);
      const s = String(p.subcategory||'').trim(); if (s) allVals.subcategory.add(s);
    });
    base.forEach(p=>{
      if (matchesExcept(p, 'vendor')) incr(sets.vendor, p.vendor);
      if (matchesExcept(p, 'manufacturer')) incr(sets.manufacturer, p.manufacturer);
      if (matchesExcept(p, 'category')) incr(sets.category, p.category);
      if (matchesExcept(p, 'subcategory')) incr(sets.subcategory, p.subcategory);
    });
    const renderFilterGroup = (containerId, map, key) => {
      const wrap = document.getElementById(containerId);
      if (!wrap) return;
      wrap.innerHTML='';
      for (const val of Array.from(state.filters[key])){ if (!map.has(val)) map.set(val, 0); }
      const entries = Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
      entries.forEach(([name,count])=>{
        const id = `f_${key}_`+btoa(encodeURIComponent(name)).replace(/=+/g,'');
        const checked = state.filters[key].has(name);
        const div=document.createElement('div');
        div.innerHTML=`<label class="inline-flex items-center gap-2 w-full px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" id="${id}" class="accent-indigo-600" ${checked?'checked':''}/>
          <span class="flex-1 min-w-0">${name}</span>
          <span class="text-gray-400">(${count})</span>
        </label>`;
        wrap.appendChild(div);
        div.querySelector('input').addEventListener('change', (e)=>{
          if (e.target.checked) state.filters[key].add(name);
          else state.filters[key].delete(name);
          recomputeFilterOptions();
          applyFilters();
        });
      });
    };
    for (const key of ['vendor','manufacturer','category','subcategory']){
      for (const val of Array.from(state.filters[key])){ if (!allVals[key].has(val)) state.filters[key].delete(val); }
    }
    renderFilterGroup('filterVendor', sets.vendor, 'vendor');
    renderFilterGroup('filterManufacturer', sets.manufacturer, 'manufacturer');
    renderFilterGroup('filterCategory', sets.category, 'category');
    renderFilterGroup('filterSubcategory', sets.subcategory, 'subcategory');
  }

  // initial render of filter options
  try { recomputeFilterOptions(); } catch(_){}

  // Helpers
  function saveCart(){ localStorage.setItem('bts_cart', JSON.stringify(state.cart)); updateCartUI(); }
  function cartCount(){ return state.cart.reduce((s,i)=> s + (i.qty||0), 0); }

  function getActivePromoSkusMap(){ return window.PromoEngine.skusMap(state.activePromos); }
  const promoSkusMap = getActivePromoSkusMap();

  function recomputeDiscounts(){ window.PromoEngine.applyPromos(state.cart, state.activePromos); }

  function cartTotal(){
    recomputeDiscounts();
    const subtotal = state.cart.reduce((s,i)=> s + (i.price||0)*(i.qty||0), 0);
    const discount = state.cart.reduce((s,i)=> s + (i._discountAmount||0), 0);
    return { subtotal, discount, total: Math.max(0, subtotal - discount) };
  }
  function updateCartUI(){ const t=cartTotal(); cartBadge.textContent = String(cartCount()); cartTotalTop.textContent = window.Utils.formatCurrency(t.total); cartTotalBottom.textContent = window.Utils.formatCurrency(t.total); }
  function showCart(open=true){ cartOverlay.classList.toggle('open', open); cartPanel.classList.toggle('open', open); if (open) renderCart(); }
  function addToCart(p, inc){
    const step = Number(p.shipmentQuantum||1) || 1;
    let item = state.cart.find(i=>i.sku===p.sku);
    if (!item){
      item = {
        sku: p.sku,
        name: p.name,
        barcode: String(p.barcode||''),
        price: Number(p.pricePromo||p.priceBase||p.price||0),
        qty: 0,
        image: (state.imgs.get(p.sku)||[])[0]||''
      };
      state.cart.push(item);
    }
    item.qty = Math.max(0, (item.qty||0) + (inc ?? step));
    if (item.qty===0){ state.cart = state.cart.filter(i=>i !== item); }
    saveCart(); animateCartAdd();
  }
  function animateCartAdd(){ cartBadge.classList.add('animate-bounce'); setTimeout(()=>cartBadge.classList.remove('animate-bounce'), 600); }
  function qtyControls(p){
    const item = state.cart.find(i=>i.sku===p.sku);
    if (!item){ return `<button data-act="add" data-sku="${p.sku}" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm">➕ В корзину</button>`; }
    return `
      <div class="inline-flex items-center gap-2">
        <button data-act="dec" data-sku="${p.sku}" class="border px-2 py-1 rounded">-</button>
        <input data-act="qty" data-sku="${p.sku}" type="number" class="w-16 border rounded px-2 py-1 text-center tabular-nums" value="${item.qty}" min="0" />
        <button data-act="inc" data-sku="${p.sku}" class="border px-2 py-1 rounded">+</button>
      </div>`;
  }

  function applyFilters(){
    const s = state.search.toLowerCase().trim();
    const f = state.filters; const hasAny = Object.values(f).some(set=>set.size>0);
    const selected = (set, val)=> set.size===0 || set.has(String(val||'').trim());
    const promoSet = state.promoFilterSkus ? new Set(state.promoFilterSkus.map(x=>String(x||'').trim())) : null;
    state.filtered = state.items.filter(p=>{
      if (state.topOnly && !(p.topSku === 1 || String(p.topSku) === '1')) return false;
      if (promoSet){
        const keySku = String(p.sku||'').trim();
        const keyBarcode = String(p.barcode||'').trim();
        const match = (keyBarcode && promoSet.has(keyBarcode)) || (keySku && promoSet.has(keySku));
        if (!match) return false;
      }
      if (s){ const hay = [p.name,p.sku,p.barcode,p.category,p.manufacturer,p.vendor].map(x=>String(x||'').toLowerCase()).join(' '); if (!hay.includes(s)) return false; }
      if (hasAny){ if (!selected(f.vendor, p.vendor)) return false; if (!selected(f.manufacturer, p.manufacturer)) return false; if (!selected(f.category, p.category)) return false; if (!selected(f.subcategory, p.subcategory)) return false; }
      return true;
    });
    applySort();
    state.page = 0; renderList(); updateStats();
    localStorage.setItem('bts_cat_view', state.view);
    localStorage.setItem('bts_cat_sort', state.sort);
  }
  function applySort(){
    const cmp = {
      'name-asc': (a,b)=> String(a.name||'').localeCompare(String(b.name||'')),
      'name-desc': (a,b)=> String(b.name||'').localeCompare(String(a.name||'')),
      'price-asc': (a,b)=> (Number(a.pricePromo||a.priceBase||a.price||0) - Number(b.pricePromo||b.priceBase||b.price||0)),
      'price-desc': (a,b)=> (Number(b.pricePromo||b.priceBase||b.price||0) - Number(a.pricePromo||a.priceBase||a.price||0)),
      'category': (a,b)=> String(a.category||'').localeCompare(String(b.category||'')) || String(a.name||'').localeCompare(String(b.name||'')),
      'sortOrder': (a,b)=> Number(a.sortOrder||0) - Number(b.sortOrder||0)
    };
    state.filtered.sort(cmp[state.sort]||cmp.sortOrder);
  }
  function updateStats(){ if (statsEl) statsEl.textContent = `Найдено: ${state.filtered.length}`; }

  function renderList(){
    const isGrid = state.view==='grid';
    const slice = state.infinite ? state.filtered : state.filtered.slice(0, (state.page+1)*state.pageSize);
    if (gridEl) gridEl.classList.toggle('hidden', !isGrid);
    if (tableWrap) tableWrap.classList.toggle('hidden', isGrid);
    if (gridEl) gridEl.style.display = isGrid ? '' : 'none';
    if (tableWrap) tableWrap.style.display = isGrid ? 'none' : '';
    if (loadMoreBtn){ loadMoreBtn.style.display = state.infinite ? 'none' : (slice.length < state.filtered.length ? '' : 'none'); }
    if (isGrid){ if (gridEl){ gridEl.innerHTML=''; slice.forEach(p=> gridEl.appendChild(renderCard(p)) ); observeProductImages(gridEl); } }
    else { if (tableBody){ tableBody.innerHTML=''; slice.forEach(p=> tableBody.appendChild(renderRow(p)) ); observeProductImages(tableBody); } }
  }

  // --- Lazy image loader (IntersectionObserver) ---
  const IMG_FINAL_CACHE = new Map();
  const localImageService = {
    async getById(id){
      const raw = String(id||'').trim(); if (!raw) return null;
      try { const direct = state.imgs.get(raw); if (direct?.[0]) return direct[0]; } catch(_){ }
      const key = raw.replace(/\.(jpe?g|png|webp)$/i, '');
      try { const bySku = state.imgs.get(key); if (bySku?.[0]) return bySku[0]; } catch(_){ }
      try { const prods = state.items || []; const found = prods.find(x => String(x.barcode||'').trim() === key); if (found?.sku){ const byMappedSku = state.imgs.get(found.sku); if (byMappedSku?.[0]) return byMappedSku[0]; } } catch(_){ }
      try {
        const recBySku = await window.Storage.get('productImages', key).catch(()=>null);
        if (recBySku?.images?.[0]) return recBySku.images[0];
        const prods = state.items || [];
        const found = prods.find(x => String(x.barcode||'').trim() === key);
        if (found?.sku){ const recByBarcode = await window.Storage.get('productImages', found.sku).catch(()=>null); if (recByBarcode?.images?.[0]) return recByBarcode.images[0]; }
      } catch(_){ }
      return null;
    }
  };
  function placeholderDataURL(text){ const t = (text||'').toString().slice(0,18); const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#f1f5f9"/></svg>`; return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  let imageObserver = null;
  function setupImageObserver(){
    if (imageObserver) imageObserver.disconnect();
    imageObserver = new IntersectionObserver(entries => {
      entries.forEach(async entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        const sku = img.getAttribute('data-sku');
        const barcode = img.getAttribute('data-barcode');
        const cacheKey = (barcode || sku || '').toString();
        const cached = IMG_FINAL_CACHE.get(cacheKey);
        if (cached){ img.src = cached; img.setAttribute('data-loaded','1'); img.classList.remove('skeleton'); imageObserver.unobserve(img); return; }
        if (img.getAttribute('data-loaded') === '1') return;
        let localUrl = await localImageService.getById(barcode || sku) || await localImageService.getById(sku);
        if (!localUrl){
          localUrl = await localImageService.getById('1111111111') || await localImageService.getById('1111111111.jpg') || await localImageService.getById('1111111111.jpeg') || await localImageService.getById('1111111111.webp') || await localImageService.getById('1111111111.png');
        }
        const src = localUrl || placeholderDataURL(sku || barcode);
        IMG_FINAL_CACHE.set(cacheKey, src);
        img.src = src; img.setAttribute('data-loaded','1'); img.classList.remove('skeleton'); imageObserver.unobserve(img);
      });
    }, { rootMargin: '200px 0px' });
  }
  function observeProductImages(root){ if (!imageObserver) setupImageObserver(); (root || document).querySelectorAll('img[data-lazy="1"]').forEach(img => { if (img.getAttribute('data-loaded') === '1') return; imageObserver.observe(img); }); }

  function renderImagesCarousel(imgs, sku, barcode, opts={}){
    const wrap=document.createElement('div');
    wrap.className='relative';
    wrap.dataset.sku = sku || '';
    wrap.setAttribute('data-img-wrap','1');
    const imgEl=document.createElement('img');
    imgEl.loading='lazy';
    imgEl.src = placeholderDataURL(sku || barcode);
    imgEl.className='product-img skeleton';
    imgEl.setAttribute('data-lazy','1');
    imgEl.setAttribute('data-sku', sku || '');
    imgEl.setAttribute('data-barcode', barcode || '');
    wrap.appendChild(imgEl);
    // Top SKU badge — left top (thumb up)
    const isTop = (opts?.topSku === 1 || String(opts?.topSku) === '1' || opts?.topSku === true);
    if (isTop){ const b=document.createElement('div'); b.className='absolute top-1 left-1 bg-amber-500 text-white text-xs px-2 py-0.5 rounded'; b.innerHTML = '<i class="bi bi-hand-thumbs-up-fill"></i>'; b.title = 'ТОП SKU'; wrap.appendChild(b); }
    // Promo badge — right top
    const promosFor = promoSkusMap.get(String(barcode||sku||'').trim()) || promoSkusMap.get(String(sku||'').trim());
    if (promosFor && promosFor.length){ const p = promosFor[0]; const hint = (()=>{ const t = (p.type||'').toLowerCase(); if (t==='купи_получи'){ const it=p.items?.[0]; return `Купи ${it?.requiredQty||1} шт. — скидка ${p.discountPercent||0}%`; } if (t==='набор'){ return `Набор — скидка ${p.discountPercent||0}% при покупке всех позиций`; } return p.name||'АКЦИЯ'; })(); const b=document.createElement('div'); b.className='absolute top-1 right-1 bg-rose-600 text-white text-xs px-2 py-0.5 rounded shadow'; b.textContent='Еще дешевле'; b.title = hint; wrap.appendChild(b); }
    return wrap;
  }

  function priceBlock(p){ const base = Number(p.priceBase||p.price||0); const promo = Number(p.pricePromo||0); if (promo && promo < base){ return `<div><div class="text-sm text-gray-600 line-through">${window.Utils.formatCurrency(base)}</div><div class="text-red-600 font-medium">${window.Utils.formatCurrency(promo)} 🔥</div></div>`; } return `<div class="font-medium">${window.Utils.formatCurrency(base)}</div>`; }

  function renderCard(p){
    const card=document.createElement('div'); card.className='product-card bg-white border rounded-xl p-2 shadow-sm';
    const imgs = state.imgs.get(p.sku)||[];
    const top = document.createElement('div'); top.appendChild(renderImagesCarousel(imgs, p.sku, p.barcode, { topSku: (p.topSku === 1 || String(p.topSku) === '1') })); card.appendChild(top);
    const title=document.createElement('div'); title.className='mt-2 two-line-title text-slate-900'; title.textContent=p.name||p.fullName||p.sku; card.appendChild(title);
    const pack=document.createElement('div'); pack.className='text-xs text-gray-600 mt-1'; pack.textContent='Шт. в блоке: ' + (p.unitsInBox||p.shipmentQuantum||1); card.appendChild(pack);
    const hr=document.createElement('div'); hr.className='my-2 border-t'; card.appendChild(hr);
    const price=document.createElement('div'); price.innerHTML=priceBlock(p); card.appendChild(price);
    const hr2=document.createElement('div'); hr2.className='my-2 border-t'; card.appendChild(hr2);
    const controls=document.createElement('div'); controls.innerHTML=qtyControls(p); card.appendChild(controls);
    const lineTotal=document.createElement('div'); lineTotal.className='text-xs text-gray-600 mt-1'; card.appendChild(lineTotal);
    function updateLineTotal(){ const item = state.cart.find(i=>i.sku===p.sku); if (!item || !item.qty){ lineTotal.textContent = ''; return; } const total = (Number(item.qty||0) * Number(item.price||0)); lineTotal.innerHTML = `Итого: <b>${window.Utils.formatCurrency(total)}</b>`; }
    updateLineTotal();
    card.addEventListener('dblclick', ()=> openProductModal(p));
    card.addEventListener('click', (e)=>{
      const btn=e.target.closest('[data-act]'); if(!btn) return; const act=btn.getAttribute('data-act'); if (act==='add'){ addToCart(p); controls.innerHTML=qtyControls(p); updateLineTotal(); } if (act==='inc'){ addToCart(p, + (p.shipmentQuantum||1)); controls.innerHTML=qtyControls(p); updateLineTotal(); } if (act==='dec'){ addToCart(p, - (p.shipmentQuantum||1)); controls.innerHTML=qtyControls(p); updateLineTotal(); }
    });
    card.addEventListener('change', (e)=>{ const inp=e.target.closest('input[data-act="qty"]'); if (!inp) return; const qty=Math.max(0, Number(inp.value||0)); const item=state.cart.find(i=>i.sku===p.sku); if (item){ item.qty=qty; saveCart(); controls.innerHTML=qtyControls(p); updateLineTotal(); } });
    return card;
  }

  function renderRow(p){
    const tr=document.createElement('tr');
    const sku = p.sku; const barcode = p.barcode || '';
    const imgPlaceholder = placeholderDataURL(sku || barcode);
    const topMark = (p.topSku === true || p.topSku === 1 || p.topSku === '1') ? '<span class="absolute -top-1 -left-1 bg-amber-500 text-white text-[10px] px-1 rounded" title="ТОП SKU"><i class="bi bi-hand-thumbs-up-fill"></i></span>' : '';
    const promoMark = promoSkusMap.has(sku) ? '<span class="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] px-1 rounded" title="Акция">🔥</span>' : '';
    const cartCellHtml = ()=>{ const item = state.cart.find(i=>i.sku===p.sku); const total = item && item.qty ? (Number(item.qty||0) * Number(item.price||0)) : 0; const line = (item && item.qty) ? `<div class="text-xs text-gray-600 mt-1">Итого: <b>${window.Utils.formatCurrency(total)}</b></div>` : ''; return `${qtyControls(p)}${line}`; };
    tr.innerHTML = `
      <td class="py-2 pr-2">
        <div class="relative inline-block" data-img-wrap="1">
          ${topMark}
          ${promoMark}
          <img src="${imgPlaceholder}" data-lazy="1" data-sku="${sku}" data-barcode="${barcode}" class="product-img-table border skeleton" alt="${String(sku||'')}">
        </div>
      </td>
      <td class="py-2 pr-2">${p.sku}</td>
      <td class="py-2 pr-2"><div class="title-3lines">${p.name||''}</div></td>
      <td class="py-2 pr-2">${p.category||''}</td>
      <td class="py-2 pr-2">${window.Utils.formatCurrency(p.priceBase||p.price||0)}</td>
      <td class="py-2 pr-2">${p.pricePromo? window.Utils.formatCurrency(p.pricePromo): '—'}</td>
      <td class="py-2 pr-2">${p.unitsInBox||p.shipmentQuantum||1}</td>
      <td class="py-2 pr-2">${cartCellHtml()}</td>`;
    tr.addEventListener('dblclick', ()=> openProductModal(p));
    tr.addEventListener('click', (e)=>{
      const btn=e.target.closest('[data-act]'); if(!btn) return; const act=btn.getAttribute('data-act'); if (act==='add'){ addToCart(p); tr.querySelector('td:last-child').innerHTML=cartCellHtml(); } if (act==='inc'){ addToCart(p, + (p.shipmentQuantum||1)); tr.querySelector('td:last-child').innerHTML=cartCellHtml(); } if (act==='dec'){ addToCart(p, - (p.shipmentQuantum||1)); tr.querySelector('td:last-child').innerHTML=cartCellHtml(); }
    });
    tr.addEventListener('change', (e)=>{ const inp=e.target.closest('input[data-act="qty"]'); if (!inp) return; const qty=Math.max(0, Number(inp.value||0)); const item=state.cart.find(i=>i.sku===p.sku); if (item){ item.qty=qty; saveCart(); tr.querySelector('td:last-child').innerHTML=cartCellHtml(); } });
    return tr;
  }

  function renderCart(){
    cartBody.innerHTML='';
    if (state.cart.length===0){ cartBody.innerHTML = '<div class="text-sm text-gray-500">Корзина пуста</div>'; return; }
    recomputeDiscounts();
    state.cart.forEach(item=>{
      const div=document.createElement('div'); div.className='border rounded-lg p-2 flex gap-2 items-center';
      const img=item.image? `<img src="${item.image}" class="w-12 h-12 rounded border"/>` : '<div class="w-12 h-12 rounded border bg-gray-100"></div>';
      const lineSubtotal = (item.price||0)*(item.qty||0);
      const disc = Math.round(item._discountAmount||0);
      const lineTotal = Math.max(0, lineSubtotal - disc);
      div.innerHTML = `${img}
        <div class="flex-1 min-w-0">
          <div class="truncate">${item.name}</div>
          <div class="text-xs text-gray-500">Артикул: ${item.sku}</div>
          <div class="text-sm">Цена: ${window.Utils.formatCurrency(item.price)} × ${item.qty} = <b>${window.Utils.formatCurrency(lineSubtotal)}</b></div>
          ${disc>0 ? `<div class="text-sm text-red-600">🔥 ${item._promoApplied||'АКЦИЯ'} -${item._discountPercent}%: -${window.Utils.formatCurrency(disc)}</div>`:''}
          ${disc>0 ? `<div class="text-sm">Итого: <b>${window.Utils.formatCurrency(lineTotal)}</b></div>`:''}
        </div>
        <div class="flex items-center gap-2">
          <button data-act="dec" data-sku="${item.sku}" class="border px-2 py-1 rounded">-</button>
          <input data-act="qty" data-sku="${item.sku}" type="number" class="w-16 border rounded px-2 py-1 text-center tabular-nums" value="${item.qty}" min="0" />
          <button data-act="inc" data-sku="${item.sku}" class="border px-2 py-1 rounded">+</button>
          <button data-act="rm" data-sku="${item.sku}" class="text-red-600 hover:text-red-700">🗑️</button>
        </div>`;
      cartBody.appendChild(div);
    });
  }

  function openProductModal(p){
    const skuImgs = (state.imgs.get(p.sku)||[]).filter(Boolean);
    const fallbackImgs = (state.imgs.get('1111111111')||[]).filter(Boolean);
    let all = skuImgs.length ? skuImgs : fallbackImgs;
    const cont=document.createElement('div');
    const inPromo = promoSkusMap.has(p.sku);
    const wrap = document.createElement('div'); wrap.className = 'space-y-3';
    const carousel = document.createElement('div'); carousel.className = 'relative'; let idx = 0;
    const imgEl = document.createElement('img'); imgEl.loading = 'lazy'; imgEl.className = 'product-img'; imgEl.style.height = '130px'; imgEl.src = all[0] || placeholderDataURL(p.sku || p.barcode); carousel.appendChild(imgEl);
    if (p.topSku === 1 || String(p.topSku) === '1'){ const b=document.createElement('div'); b.className='absolute top-1 left-1 bg-amber-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1'; b.innerHTML = '<i class="bi bi-hand-thumbs-up-fill"></i><span>ТОП</span>'; carousel.appendChild(b); }
    if (inPromo){ const b=document.createElement('div'); b.className='absolute top-1 right-1 bg-red-600 text-white text-xs px-2 py-0.5 rounded'; b.textContent='🔥 АКЦИЯ'; carousel.appendChild(b); }
    const dots = document.createElement('div'); dots.className = 'carousel-dots mt-2';
    function renderDots(){ dots.innerHTML=''; if (all.length <= 1) return; all.forEach((_, i)=>{ const d = document.createElement('button'); d.type = 'button'; d.className = 'carousel-dot' + (i===idx ? ' active' : ''); d.title = 'Фото ' + (i+1); d.addEventListener('click', (e)=>{ e.stopPropagation(); idx = i; update(); }); dots.appendChild(d); }); }
    function update(){ imgEl.src = all[idx] || placeholderDataURL(p.sku || p.barcode); renderDots(); }
    if (all.length > 1){ const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 border rounded-lg px-2 py-1 text-gray-700 hover:bg-white'; prev.innerHTML = '<i class="bi bi-chevron-left"></i>'; prev.addEventListener('click', (e)=>{ e.stopPropagation(); idx = (idx - 1 + all.length) % all.length; update(); }); const next = document.createElement('button'); next.type = 'button'; next.className = 'absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 border rounded-lg px-2 py-1 text-gray-700 hover:bg-white'; next.innerHTML = '<i class="bi bi-chevron-right"></i>'; next.addEventListener('click', (e)=>{ e.stopPropagation(); idx = (idx + 1) % all.length; update(); }); carousel.appendChild(prev); carousel.appendChild(next); imgEl.style.cursor = 'pointer'; imgEl.addEventListener('click', ()=>{ idx = (idx + 1) % all.length; update(); }); }
    wrap.appendChild(carousel); wrap.appendChild(dots); renderDots();
    const title = document.createElement('div'); title.className = 'font-medium text-lg'; title.textContent = p.name||p.sku; wrap.appendChild(title);
    if (p.fullName){ const full = document.createElement('div'); full.className = 'text-xs text-gray-500'; full.textContent = p.fullName; wrap.appendChild(full); }
    const skuRow = document.createElement('div'); skuRow.className = 'text-sm text-gray-600 flex items-center gap-2'; skuRow.innerHTML = `Артикул: ${p.sku} <button data-copy="${p.sku}" class="border px-2 py-1 rounded text-xs">📋</button>`; wrap.appendChild(skuRow);
    const bcRow = document.createElement('div'); bcRow.className = 'text-sm text-gray-600 flex items-center gap-2'; bcRow.innerHTML = `Штрихкод: ${p.barcode||'—'} ${p.barcode? `<button data-copy="${p.barcode}" class="border px-2 py-1 rounded text-xs">📋</button>`:''}`; wrap.appendChild(bcRow);
    const desc = document.createElement('div'); desc.className = 'text-sm text-gray-700'; desc.innerHTML = `<div class="text-xs text-gray-500 mb-1">Описание</div><div>${(p.description && String(p.description).trim()) ? String(p.description) : '<span class="text-gray-400">—</span>'}</div>`; wrap.appendChild(desc);
    const price = document.createElement('div'); price.innerHTML = priceBlock(p); wrap.appendChild(price);
    if (inPromo){ const note = document.createElement('div'); note.className = 'text-xs text-red-600'; note.textContent = 'Товар участвует в акции — возможна скидка при выполнении условий'; wrap.appendChild(note); }
    const controls = document.createElement('div'); controls.innerHTML = qtyControls(p); wrap.appendChild(controls);
    cont.appendChild(wrap);
    const okPromise = window.Utils.showModal('Товар', cont, [{label:'Закрыть', value:false}], { variant:'product' });
    cont.addEventListener('click', (e)=>{
      const btn=e.target.closest('[data-act]'); if(btn){ const act=btn.getAttribute('data-act'); if (act==='add'){ addToCart(p); controls.innerHTML=qtyControls(p); } if (act==='inc'){ addToCart(p, + (p.shipmentQuantum||1)); controls.innerHTML=qtyControls(p); } if (act==='dec'){ addToCart(p, - (p.shipmentQuantum||1)); controls.innerHTML=qtyControls(p); } }
      const cpy=e.target.closest('button[data-copy]'); if (cpy){ window.Utils.copyToClipboard(cpy.getAttribute('data-copy')); }
    });
    return okPromise;
  }

  // Promo cards rendering (new UX)
  function renderPromoCards(){
    if (!state || typeof state !== 'object') return;
    const wrap = document.getElementById('promoCardsWrap');
    const track = document.getElementById('promoCardsTrack');
    const prevBtn = document.getElementById('promoPrev');
    const nextBtn = document.getElementById('promoNext');
    if (!wrap || !track){ return; }
    if (!state.activePromos.length){ wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden'); track.innerHTML='';
    const pastel = ['from-sky-50 to-white','from-rose-50 to-white','from-emerald-50 to-white','from-violet-50 to-white','from-amber-50 to-white','from-cyan-50 to-white'];
    const cards = state.activePromos.map((p,idx)=>{
      const card=document.createElement('div');
      const tone = pastel[idx % pastel.length];
      card.className=`promo-card rounded-lg border shadow-sm p-3 w-[calc(25%-8px)] min-w-[220px] bg-gradient-to-br ${tone}`;
      const cover = p.coverUrl ? `<div class="promo-cover w-full overflow-hidden mb-2 rounded-md"><img src="${p.coverUrl}" alt="" class="w-full h-full object-cover"></div>` : '';
      const title = window.Utils.escapeXml ? window.Utils.escapeXml(p.name||'Спецпредложение') : (p.name||'Спецпредложение');
      const condRaw = (p.condition ?? p.conditions ?? p['Условия'] ?? p['условия'] ?? p.cond ?? p.rule ?? '').toString().trim();
      const tooltipText = condRaw ? `Условия акции: ${condRaw}` : '';
      card.innerHTML = `${cover}<div class="text-sm font-semibold mb-1 truncate" title="${title}">${title}</div><div class="promo-footer"><span class="badge bg-rose-100 text-rose-700 border border-rose-200" title="${window.Utils.escapeXml?.(tooltipText)||''}">АКЦИЯ</span><button class="buyPromoBtn border px-2 py-1 rounded-md text-xs hover:bg-slate-50">Купить</button></div>`;
      if (tooltipText){ card.title = tooltipText; }
      card.querySelector('.buyPromoBtn').addEventListener('click', ()=>{ state.promoFilterSkus = (p.items||[]).map(i=> String(i.barcode||i.sku||'').trim()).filter(Boolean); applyFilters(); window.Utils.showToast('Показаны товары акции', 'info'); });
      return card;
    });
    const perView = 4; const clonesHead = cards.slice(0, perView).map(c=> c.cloneNode(true)); const clonesTail = cards.slice(-perView).map(c=> c.cloneNode(true));
    clonesTail.forEach(c=> track.appendChild(c)); cards.forEach(c=> track.appendChild(c)); clonesHead.forEach(c=> track.appendChild(c));
    let index = perView; function update(noAnim=false){ track.style.transition = noAnim ? 'none' : 'transform .3s ease'; const width = track.parentElement.clientWidth; const offset = (index - perView) * width; track.style.transform = `translateX(-${offset}px)`; }
    function normalize(){ const total = cards.length; if (index >= total + perView){ index = perView; update(true); } if (index < perView){ index = total + perView - 1; update(true); } }
    prevBtn.onclick = ()=>{ index--; update(); setTimeout(normalize, 320); };
    nextBtn.onclick = ()=>{ index++; update(); setTimeout(normalize, 320); };
    if (state.promoTimer){ clearInterval(state.promoTimer); state.promoTimer=null; }
    prevBtn.style.visibility = (cards.length>perView)?'visible':'hidden';
    nextBtn.style.visibility = (cards.length>perView)?'visible':'hidden';
    const listEl = document.getElementById('catGrid'); let hiddenOnScroll=false; if (listEl && wrap){ listEl.addEventListener('scroll', ()=>{ if (hiddenOnScroll) return; wrap.style.display='none'; hiddenOnScroll=true; }); }
    setTimeout(()=>update(true), 0);
  }

  // Events
  if (catSearch){ catSearch.value = state.search; catSearch.addEventListener('input', window.Utils.debounce(()=>{ state.search=catSearch.value; applyFilters(); }, 300)); }
  if (viewGridBtn){ viewGridBtn.addEventListener('click', ()=>{ state.view='grid'; applyFilters(); }); }
  if (viewTableBtn){ viewTableBtn.addEventListener('click', ()=>{ state.view='table'; applyFilters(); }); }
  try { renderPromoCards(); } catch(e){ console.warn('renderPromoCards error', e); }
  try { if (catInfinite){ catInfinite.checked = !!state.infinite; catInfinite.addEventListener('change', ()=>{ state.infinite = !!catInfinite.checked; localStorage.setItem('bts_cat_infinite', state.infinite ? '1' : '0'); state.page = 0; renderList(); updateStats(); }); } } catch(_){ }
  try {
    const layoutEl = document.getElementById('catLayout');
    const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
    const saved = localStorage.getItem('bts_cat_filters_open');
    if (layoutEl){ const open = saved !== '0'; layoutEl.classList.toggle('filters-hidden', !open); }
    toggleFiltersBtn?.addEventListener('click', ()=>{ if (!layoutEl) return; const willOpen = layoutEl.classList.contains('filters-hidden'); layoutEl.classList.toggle('filters-hidden', !willOpen); localStorage.setItem('bts_cat_filters_open', willOpen ? '1' : '0'); });
  } catch(_){ }
  if (topSkuBtn){ topSkuBtn.addEventListener('click', ()=>{ state.topOnly=!state.topOnly; topSkuBtn.classList.toggle('bg-indigo-600'); topSkuBtn.classList.toggle('text-white'); applyFilters(); }); }
  if (resetFiltersBtn){ resetFiltersBtn.addEventListener('click', ()=>{ state.search=''; if (catSearch) catSearch.value=''; state.topOnly=false; state.filters={ vendor:new Set(), manufacturer:new Set(), category:new Set(), subcategory:new Set() }; state.promoFilterSkus=null; try { recomputeFilterOptions(); } catch(_){ } applyFilters(); }); }
  if (sortBtn){ sortBtn.addEventListener('click', (e)=>{ e.stopPropagation(); sortMenu.classList.toggle('hidden'); }); }
  document.addEventListener('click', (e)=>{ if (!sortMenu) return; if (!sortMenu.contains(e.target) && e.target!==sortBtn) sortMenu.classList.add('hidden'); });
  if (sortMenu){ sortMenu.addEventListener('click', (e)=>{ const a=e.target.closest('a[data-sort]'); if(!a) return; e.preventDefault(); state.sort=a.getAttribute('data-sort'); sortMenu.classList.add('hidden'); applySort(); state.page=0; renderList(); updateStats(); }); }
  if (loadMoreBtn){ loadMoreBtn.addEventListener('click', ()=>{ if (state.infinite) return; state.page++; renderList(); }); }
  if (cartOpenBtn){ cartOpenBtn.addEventListener('click', ()=> showCart(true)); }
  if (cartCloseBtn){ cartCloseBtn.addEventListener('click', ()=> showCart(false)); }
  if (cartOverlay){ cartOverlay.addEventListener('click', ()=> showCart(false)); }
  if (cartBody){ cartBody.addEventListener('click', (e)=>{ const btn=e.target.closest('[data-act]'); if(!btn) return; const sku=btn.getAttribute('data-sku'); const item=state.cart.find(i=>i.sku===sku); if(!item) return; const p=state.items.find(x=>x.sku===sku) || { shipmentQuantum:1 }; if (btn.dataset.act==='inc'){ item.qty += Number(p.shipmentQuantum||1)||1; } if (btn.dataset.act==='dec'){ item.qty = Math.max(0, item.qty - (Number(p.shipmentQuantum||1)||1)); if (item.qty===0) state.cart = state.cart.filter(i=>i.sku!==sku); } if (btn.dataset.act==='rm'){ state.cart = state.cart.filter(i=>i.sku!==sku); } saveCart(); renderCart(); }); }
  if (cartBody){ cartBody.addEventListener('change', (e)=>{ const inp=e.target.closest('input[data-act="qty"]'); if (!inp) return; const sku=inp.getAttribute('data-sku'); const item=state.cart.find(i=>i.sku===sku); if(!item) return; const qty=Math.max(0, Number(inp.value||0)); item.qty=qty; if (qty===0) state.cart=state.cart.filter(i=>i.sku!==sku); saveCart(); renderCart(); }); }
  if (cartClearBtn){ cartClearBtn.addEventListener('click', async ()=>{ const ok=await window.Utils.showModal('Очистить корзину', 'Удалить все позиции?', [ {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'}, {label:'Очистить', value:true, class:'bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg'} ]); if (ok){ state.cart=[]; saveCart(); renderCart(); }}); }
  if (cartExportBtn){ cartExportBtn.addEventListener('click', async ()=>{
    try {
      recomputeDiscounts();
      const headers = ['Артикул','Наименование','Цена','Кол-во','Сумма','Скидка','Итого','Акция'];
      const rows = state.cart.map(i=>{ const sub = (Number(i.price||0) * Number(i.qty||0)); const disc = Math.round(Number(i._discountAmount||0)); const tot = Math.max(0, sub - disc); return [i.sku, i.name, i.price, i.qty, sub, disc, tot, i._promoApplied||'']; });
      const ok = await (typeof window.XLSXLoader !== 'undefined' ? window.XLSXLoader.ensure().catch(()=>false) : Promise.resolve(typeof window.XLSX !== 'undefined'));
      if (ok && window.XLSX?.utils){ const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]); const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, 'Корзина'); window.Utils.saveWorkbookXLSX(wb, 'cart.xlsx'); return; }
      const xml = window.Utils.buildExcelXmlTable(headers, rows, 'Корзина'); window.Utils.downloadFile('cart.xls', xml, 'application/vnd.ms-excel'); window.Utils.showToast('XLSX недоступен — скачан Excel .xls (совместимый формат)', 'warning');
    } catch(e){ console.error('cartExportBtn error', e); window.Utils.showToast('Не удалось скачать Excel', 'error'); }
  }); }
  if (cartCheckoutBtn){ cartCheckoutBtn.addEventListener('click', async ()=>{
    const div=document.createElement('div');
    const defDelivery = (function(){ const base = new Date(); base.setHours(0,0,0,0); const d = (window.Scheduler && typeof window.Scheduler.addDays === 'function') ? window.Scheduler.addDays(base, 2) : new Date(base.getTime() + 2*86400000); if (window.Scheduler && typeof window.Scheduler.toISODate === 'function') return window.Scheduler.toISODate(d); const yyyy = d.getFullYear(); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; })();
    div.innerHTML = `
      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1">Дата доставки</label>
          <input id="chkDeliveryDate" type="date" class="w-full border rounded-lg px-3 py-2" value="${defDelivery}" />
          <div class="text-xs text-gray-500 mt-1">По умолчанию: послезавтра (сегодня + 2 дня)</div>
        </div>
        <div>
          <label class="block text-sm mb-1">Клиент (Наименование + ИНН)</label>
          <input id="chkClient" class="w-full border rounded-lg px-3 py-2" placeholder="Поиск: наименование + ИНН" />
          <div id="chkClientList" class="border rounded-lg mt-1 max-h-44 overflow-auto hidden"></div>
          <div class="text-xs text-gray-500 mt-1">Если выбран клиент — ниже будет список точек доставки этого ИНН.</div>
        </div>
        <div>
          <label class="block text-sm mb-1">Точка доставки (Код клиента + Адрес)</label>
          <input id="chkOutletSearch" class="w-full border rounded-lg px-3 py-2" placeholder="Поиск: код клиента или адрес" />
          <div id="chkOutletList" class="border rounded-lg mt-1 max-h-44 overflow-auto hidden"></div>
          <div class="text-xs text-gray-500 mt-1">Если выбрать точку здесь — клиент (Наименование + ИНН) подставится автоматически.</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label class="block text-sm mb-1">ИНН</label>
            <input id="chkInn" class="w-full border rounded-lg px-3 py-2 bg-gray-50" readonly />
          </div>
          <div>
            <label class="block text-sm mb-1">Адрес доставки</label>
            <input id="chkAddress" class="w-full border rounded-lg px-3 py-2 bg-gray-50" readonly />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label class="block text-sm mb-1">Форма оплаты</label>
            <select id="chkPayment" class="w-full border rounded-lg px-3 py-2">
              <option>Наличные по факту</option>
              <option>Предоплата</option>
              <option>Банк 7 дней</option>
              <option>Банк 14 дней</option>
              <option>Банк 21 день</option>
              <option>Банк 28 дней</option>
            </select>
            <div class="text-xs text-gray-500 mt-1">По умолчанию подставляется из карточки точки.</div>
          </div>
          <div>
            <label class="block text-sm mb-1">Кредитный лимит</label>
            <input id="chkCreditLimit" class="w-full border rounded-lg px-3 py-2 bg-gray-50" readonly />
          </div>
        </div>
        <div>
          <label class="block text-sm mb-1">Комментарий (необязательно)</label>
          <textarea id="chkComment" rows="2" class="w-full border rounded-lg px-3 py-2" placeholder="Например: доставить после 10:00, позвонить заранее"></textarea>
        </div>
      </div>`;
    const okPromise = window.Utils.showModal('Оформление заказа', div, [ {label:'Отмена', value:false, class:'border px-3 py-1.5 rounded-lg hover:bg-gray-50'}, {label:'✅ Оформить', value:true, class:'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg'} ]);
    const visitCtx = window.currentVisitContext || {}; const outlets = await window.Storage.getAll('outlets');
    const clientInp = div.querySelector('#chkClient'); const clientList = div.querySelector('#chkClientList'); const outletInp = div.querySelector('#chkOutletSearch'); const outletList = div.querySelector('#chkOutletList');
    const innEl = div.querySelector('#chkInn'); const addrEl = div.querySelector('#chkAddress'); const creditEl = div.querySelector('#chkCreditLimit'); const payEl = div.querySelector('#chkPayment');
    let selectedInn = ''; let selectedOutletCode = '';
    const clientsByInn = new Map(); for (const o of (outlets||[])){ const inn = String(o.inn||'').trim(); if (!inn) continue; if (!clientsByInn.has(inn)) clientsByInn.set(inn, { inn, name: o.name||'', outlets: [] }); clientsByInn.get(inn).outlets.push(o); }
    const allClients = Array.from(clientsByInn.values());
    function formatClientLabel(name, inn){ const nm = String(name||'Клиент').trim() || 'Клиент'; const i = String(inn||'').trim(); return i ? `${nm} (${i})` : nm; }
    function setPaymentFromOutlet(outletObj){ const pt = String(outletObj?.paymentTerms||'').trim(); if (!pt) return; const opt = Array.from(payEl.options).find(o=>String(o.value||o.textContent).trim()===pt); if (opt) payEl.value = opt.value; }
    function setOutlet(code){ const outletObj = (outlets||[]).find(o=>String(o.code)===String(code)) || null; if (!outletObj) return; selectedOutletCode = outletObj.code; selectedInn = String(outletObj.inn||'').trim(); clientInp.value = formatClientLabel(outletObj.name, selectedInn); outletInp.value = `${outletObj.code}${outletObj.address? ' — '+outletObj.address:''}`; innEl.value = selectedInn; addrEl.value = outletObj.address || ''; const cl = outletObj.creditLimit; creditEl.value = (cl !== undefined && cl !== null && String(cl).trim() !== '') ? window.Utils.formatCurrency(cl) : ''; setPaymentFromOutlet(outletObj); renderOutletList(''); }
    function applyClientInn(inn, name){ selectedInn = String(inn||'').trim(); clientInp.value = formatClientLabel(name, selectedInn); renderOutletList(''); }
    function renderClientList(q){ const qq = String(q||'').toLowerCase().trim(); clientList.innerHTML=''; if (!qq){ clientList.classList.add('hidden'); return; } const found = allClients.filter(c=> (c.name||'').toLowerCase().includes(qq) || String(c.inn||'').includes(qq)); found.slice(0,25).forEach(c=>{ const a=document.createElement('a'); a.href='#'; a.className='block px-3 py-2 hover:bg-gray-50 text-sm'; a.textContent = formatClientLabel(c.name, c.inn); a.addEventListener('click',(e)=>{ e.preventDefault(); clientList.classList.add('hidden'); applyClientInn(c.inn, c.name); }); clientList.appendChild(a); }); clientList.classList.toggle('hidden', found.length===0); }
    function renderOutletList(q){ const qq = String(q||'').toLowerCase().trim(); outletList.innerHTML=''; if (!selectedInn && !qq){ outletList.classList.add('hidden'); return; } const pool = selectedInn ? (outlets||[]).filter(o=>String(o.inn||'').trim()===selectedInn) : (outlets||[]); const found = pool.filter(o=>{ if (!qq) return true; const hay = [o.code, o.address, o.name, o.inn].map(x=>String(x||'').toLowerCase()).join(' '); return hay.includes(qq); }).slice(0, 50); found.forEach(o=>{ const a=document.createElement('a'); a.href='#'; a.className='block px-3 py-2 hover:bg-gray-50 text-sm'; a.textContent = `${o.code}${o.address? ' — '+o.address:''}`; a.addEventListener('click',(e)=>{ e.preventDefault(); outletList.classList.add('hidden'); setOutlet(o.code); }); outletList.appendChild(a); }); outletList.classList.toggle('hidden', found.length===0); }
    if (visitCtx.outletCode){ setOutlet(String(visitCtx.outletCode)); } else { if (visitCtx.inn){ const name = visitCtx.clientName || (allClients.find(c=>String(c.inn)===String(visitCtx.inn))?.name) || ''; applyClientInn(String(visitCtx.inn), name); } }
    clientInp.addEventListener('input', window.Utils.debounce(()=>{ const val = clientInp.value; if (!String(val||'').trim()){ selectedInn = ''; selectedOutletCode = ''; innEl.value = ''; addrEl.value = ''; creditEl.value = ''; outletInp.value = ''; outletList.classList.add('hidden'); renderClientList(''); return; } renderClientList(val); }, 200));
    outletInp.addEventListener('input', window.Utils.debounce(()=>{ renderOutletList(outletInp.value); }, 150));
    clientInp.addEventListener('focus', ()=>{ if (clientInp.value.trim()) renderClientList(clientInp.value); });
    outletInp.addEventListener('focus', ()=>{ renderOutletList(outletInp.value); });
    if (selectedInn){ renderOutletList(''); }
    const ok = await okPromise; if (!ok) return;
    if (!selectedOutletCode){ window.Utils.showToast('Выберите точку доставки', 'warning'); return; }
    recomputeDiscounts();
    const id = genOrderId();
    const totals = cartTotal();
    const outletCode = selectedOutletCode;
    const outletObj = (await window.Storage.get('outlets', outletCode))||{};
    const itemsWithBarcode = (state.cart||[]).map(it=>{ const p = (state.items||[]).find(x=>x.sku===it.sku) || {}; return { ...it, barcode: String(it.barcode || p.barcode || '') }; });
    const order = {
      id,
      date: Date.now(),
      deliveryDate: (div.querySelector('#chkDeliveryDate')?.value || '') || null,
      items: itemsWithBarcode,
      total: totals.total,
      operator: (window.Storage.getSession()?.email||''),
      outlet: outletCode,
      outletDetails: { code: outletObj.code||outletCode, name: outletObj.name||'', inn: outletObj.inn||'', address: outletObj.address||'', paymentTerms: outletObj.paymentTerms||'', creditLimit: outletObj.creditLimit ?? '' },
      payment: div.querySelector('#chkPayment')?.value||'',
      comment: (div.querySelector('#chkComment')?.value||'').trim(),
      clientText: (div.querySelector('#chkClient')?.value||'').trim()
    };
    await window.Storage.put('orders', order);
    try { await window.Notifications?.createNotification?.({ type: window.Notifications?.NOTIFICATION_TYPES?.ORDER_CREATED || 'order_created', title: 'Заказ создан', message: `Заказ ${id} успешно создан`, actionUrl: 'orders', data: { orderId: id } }); } catch(_){ }
    state.cart=[]; saveCart(); renderCart(); showCart(false); window.Utils.showToast(`Заказ ${id} успешно создан`, 'success'); if (window.VisitManager?.isActive()) { await window.VisitManager.promptFinish(); }
  }); }

  function genOrderId(){ const d=new Date(); const num=Math.floor(Math.random()*9000)+1000; const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `ORD-${yyyy}${mm}${dd}-${num}`; }

  // Init
  try { setupImageObserver(); } catch(_){ }
  try { renderPromoCards(); } catch(e){ console.warn('renderPromoCards error', e); }
  updateCartUI();
  applyFilters();

  // Provide cleanup hook for Router (to stop observers/timers)
  window.__btsCatalogCleanup = () => { try { if (imageObserver) imageObserver.disconnect(); } catch(_){} };
}

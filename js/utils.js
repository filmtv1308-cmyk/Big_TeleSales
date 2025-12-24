(function(){
  const Utils = (() => {
    function pad(n){ return n < 10 ? '0'+n : ''+n; }
    function formatDate(date, format = 'dd.MM.yyyy HH:mm'){
      const tz = (globalThis.TZ && typeof globalThis.TZ.getTimeZone === 'function') ? globalThis.TZ.getTimeZone() : 'Europe/Moscow';
      const d = date instanceof Date ? date : new Date(date);
      const parts = new Intl.DateTimeFormat('ru-RU', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      }).formatToParts(d);
      const get = (type)=> parts.find(p=>p.type===type)?.value || '';
      const map = { dd: get('day'), MM: get('month'), yyyy: get('year'), HH: get('hour'), mm: get('minute'), ss: get('second') };
      return format.replace(/dd|MM|yyyy|HH|mm|ss/g, k => map[k]);
    }
    function formatCurrency(number, currency = 'RUB', locale = 'ru-RU'){
      try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(number||0)); }
      catch(e){ return (Number(number||0).toFixed(2)) + ' ' + currency; }
    }
    function humanFileSize(bytes){ const thresh = 1024; if (Math.abs(bytes) < thresh) return bytes + ' B'; const units = ['KB','MB','GB','TB']; let u = -1; do { bytes /= thresh; ++u; } while (Math.abs(bytes) >= thresh && u < units.length - 1); return bytes.toFixed(1) + ' ' + units[u]; }
    function generateId(prefix='id'){ return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
    function generatePassword(length=12){ const lowers='abcdefghijklmnopqrstuvwxyz'; const uppers=lowers.toUpperCase(); const nums='0123456789'; const syms='!@#$%^&*()_+'; const all = lowers+uppers+nums+syms; let p=''; for(let i=0;i<length;i++){ p += all[Math.floor(Math.random()*all.length)]; } return p; }
    async function copyToClipboard(text){ try { await navigator.clipboard.writeText(text); showToast('Скопировано в буфер обмена', 'success'); } catch(e){ showToast('Не удалось скопировать', 'error'); } }
    function showToast(message, type='info'){
      const map = { info: { cls:'text-bg-primary', icon:'bi-info-circle' }, success: { cls:'text-bg-success', icon:'bi-check-circle' }, warning: { cls:'text-bg-warning', icon:'bi-exclamation-triangle' }, error: { cls:'text-bg-danger', icon:'bi-x-circle' } };
      const meta = map[type] || map.info;
      const el = document.createElement('div');
      el.className = `toast show align-items-center ${meta.cls} border-0 shadow`;
      el.setAttribute('role','alert'); el.setAttribute('aria-live','assertive'); el.setAttribute('aria-atomic','true');
      el.innerHTML = `<div class="d-flex"><div class="toast-body d-flex align-items-start gap-2"><i class="bi ${meta.icon}"></i><div style="line-height:1.2">${String(message||'')}</div></div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Close"></button></div>`;
      const wrap = document.getElementById('toast-container') || (()=>{ const w=document.createElement('div'); w.id='toast-container'; document.body.appendChild(w); return w; })();
      wrap.appendChild(el);
      el.querySelector('.btn-close')?.addEventListener('click', ()=>{ try{ el.remove(); }catch(_){} });
      setTimeout(() => { el.classList.remove('show'); el.classList.add('hide'); setTimeout(()=>{ try{ el.remove(); }catch(_){} }, 350); }, 3200);
    }
    function showModal(title, content, buttons=[{label:'OK'}], opts={}){
      return new Promise(resolve => {
        const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.tabIndex = -1;
        const card = document.createElement('div'); card.className = 'modal-card' + (opts?.variant === 'product' ? ' modal-product' : '');
        card.innerHTML = `
          <div class="px-4 py-3 border-bottom d-flex align-items-center justify-content-between" style="border-color: var(--border)">
            <div class="fw-semibold" style="max-width:80%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
            <button class="btn btn-sm btn-light" data-close title="Закрыть"><i class="bi bi-x-lg"></i></button>
          </div>
          <div class="p-4" id="modalContent" style="flex:1 1 auto; overflow:auto;"></div>
          <div class="px-4 py-3 border-top d-flex align-items-center justify-content-end gap-2" id="modalButtons" style="border-color: var(--border)"></div>`;
        overlay.appendChild(card); document.body.appendChild(overlay);
        const contentEl = card.querySelector('#modalContent'); if (typeof content === 'string') contentEl.innerHTML = content; else contentEl.appendChild(content);
        const close = (val=false) => { try { document.removeEventListener('keydown', onKey); } catch(_){ } try { overlay.remove(); } catch(_){ } resolve(val); };
        const btnsEl = card.querySelector('#modalButtons');
        buttons.forEach((b, i) => { const btn = document.createElement('button'); const fallbackClass = i===0 ? 'btn btn-primary' : 'btn btn-outline-secondary'; btn.className = (b.class && b.class.trim()) ? b.class : fallbackClass; btn.textContent = b.label; btn.addEventListener('click', () => close(b.value ?? true)); btnsEl.appendChild(btn); });
        card.querySelector('[data-close]').addEventListener('click', () => close(false));
        overlay.addEventListener('mousedown', (e)=>{ if (e.target === overlay) close(false); });
        function onKey(e){ if (e.key === 'Escape') close(false); } document.addEventListener('keydown', onKey);
      });
    }
    function debounce(fn, delay=300){ let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), delay); }; }
    function downloadFile(filename, content, type='application/octet-stream'){
      try {
        const blob = content instanceof Blob ? content : new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; a.style.position = 'fixed'; a.style.left = '-9999px'; a.style.top = '-9999px';
        document.body.appendChild(a); a.click(); setTimeout(() => { try { URL.revokeObjectURL(url); } catch(_){ } try { a.remove(); } catch(_){ } }, 4000);
      } catch(e){ try { const blob = content instanceof Blob ? content : new Blob([content], { type }); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(()=>{ try { URL.revokeObjectURL(url); } catch(_){ } }, 4000); } catch(err){ console.error('downloadFile error', err); } }
    }
    function saveWorkbookXLSX(wb, filename){
      try { if (typeof XLSX === 'undefined' && typeof XLSXLoader !== 'undefined'){ XLSXLoader.ensure().catch(()=>{}); } } catch(_){ }
      try { const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'}); downloadFile(filename, wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); return; } catch(err){ console.warn('saveWorkbookXLSX array write failed:', err); }
      try { const bin = XLSX.write(wb, {bookType:'xlsx', type:'binary'}); const buf = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i) & 0xFF; downloadFile(filename, new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); return; } catch(err2){ console.warn('saveWorkbookXLSX binary fallback failed:', err2); }
      try { if (typeof XLSX !== 'undefined' && typeof XLSX.writeFile === 'function'){ XLSX.writeFile(wb, filename); return; } } catch(err3){ console.warn('saveWorkbookXLSX writeFile fallback failed:', err3); }
      try { const b64 = XLSX.write(wb, {bookType:'xlsx', type:'base64'}); const href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + b64; const a = document.createElement('a'); a.href = href; a.download = filename; a.style.position='fixed'; a.style.left='-9999px'; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(), 2000); } catch(err4){ console.error('saveWorkbookXLSX all strategies failed:', err4); Utils?.showToast?.('Не удалось скачать файл', 'error'); }
    }
    function toCSV(rows){ if (!rows || !rows.length) return ''; const keys = Object.keys(rows[0]); const esc = v => '"'+String(v??'').replace(/"/g,'""')+'"'; const header = keys.map(esc).join(','); const lines = rows.map(r => keys.map(k => esc(r[k])).join(',')); return [header, ...lines].join('\n'); }
    function parseCSV(text, delimiter=','){
      const rows = []; let i=0, cur='', inQuotes=false, row=[]; const pushCell=()=>{ row.push(cur); cur=''; };
      while(i < text.length){ const ch=text[i++]; if (inQuotes){ if (ch==='"'){ if (text[i]==='"'){ cur+='"'; i++; } else { inQuotes=false; } } else { cur+=ch; } } else { if (ch==='"'){ inQuotes=true; } else if (ch===delimiter){ pushCell(); } else if (ch==='\n'){ pushCell(); rows.push(row); row=[]; } else if (ch==='\r'){ } else { cur+=ch; } } }
      pushCell(); if (row.length) rows.push(row); if (!rows.length) return []; const headers = rows.shift().map(h=>String(h||'').trim()); return rows.filter(r=>r.some(v=>String(v).trim()!=='')) .map(r=>{ const obj={}; headers.forEach((h,idx)=>{ obj[h]=r[idx]!==undefined?r[idx]:''; }); return obj; });
    }
    function escapeXml(str){ return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
    function buildExcelXml(headers, sheetName='Sheet1'){ return buildExcelXmlTable(headers, [], sheetName); }
    function buildExcelXmlTable(headers, rows = [], sheetName='Sheet1'){
      const rowXml = (arr)=>{ const cells = (arr||[]).map(v => `<Cell><Data ss:Type="String">${escapeXml(v)}</Data></Cell>`).join(''); return `<Row>${cells}</Row>`; };
      const headerRow = rowXml(headers||[]); const dataRows = (rows||[]).map(r => rowXml(r)).join('');
      return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${escapeXml(sheetName)}"><Table>${headerRow}${dataRows}</Table></Worksheet></Workbook>`;
    }
    function parseSpreadsheetML(xmlText){ try { const doc = new DOMParser().parseFromString(String(xmlText||''), 'application/xml'); const rows = Array.from(doc.getElementsByTagName('Row')); const matrix = rows.map(r => Array.from(r.getElementsByTagName('Cell')).map(c => c.getElementsByTagName('Data')[0]?.textContent ?? '')); if (!matrix.length) return []; const headers = (matrix.shift()||[]).map(h => String(h||'').trim()); return matrix.filter(r => r.some(v => String(v).trim() !== '')).map(r => { const obj = {}; headers.forEach((h, i) => { if (h) obj[h] = (r[i] ?? ''); }); return obj; }); } catch(e){ console.error('parseSpreadsheetML error', e); return []; } }
    function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
    return { pad, formatDate, formatCurrency, humanFileSize, generateId, generatePassword, copyToClipboard, showToast, showModal, debounce, downloadFile, saveWorkbookXLSX, toCSV, parseCSV, buildExcelXml, buildExcelXmlTable, parseSpreadsheetML, escapeXml, clamp };
  })();
  window.Utils = Utils;
})();

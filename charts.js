/**
 * Big TeleSales — Charts (Canvas)
 * Простые графики без сторонних библиотек.
 *
 * @module Charts
 */
(function(){
  'use strict';

  /**
   * Формат числа для подписей осей.
   * @param {number} n
   * @returns {string}
   */
  function formatNumber(n){
    const x = Number(n||0);
    try { return new Intl.NumberFormat('ru-RU').format(Math.round(x)); }
    catch(_){ return String(Math.round(x)); }
  }

  /**
   * Безопасно подгоняет canvas под CSS-ширину.
   * @param {HTMLCanvasElement} canvas
   */
  function fitCanvas(canvas){
    if (!canvas) return;
    const cssW = canvas.clientWidth || canvas.width || 600;
    const cssH = canvas.clientHeight || canvas.height || 240;
    // сохраняем заданный height, если он в атрибуте
    const targetH = canvas.getAttribute('height') ? Number(canvas.getAttribute('height')) : cssH;
    canvas.width = cssW;
    canvas.height = targetH;
  }

  /**
   * Рендер простого линейного графика.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {Array<{label:string, value:number}>} data
   * @param {{stroke?:string, fill?:string}} [options]
   */
  function renderLineChart(canvasOrId, data, options={}){
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    if (!canvas) return;
    fitCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    const pad = { top: 16, right: 16, bottom: 34, left: 46 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const arr = (data||[]);
    const max = Math.max(1, ...arr.map(d=>Number(d.value||0)));

    // axes
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    // y labels
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'right';
    for (let i=0;i<=4;i++){
      const v = (max/4)*i;
      const y = pad.top + chartH - (i/4)*chartH;
      ctx.fillText(formatNumber(v), pad.left - 8, y + 4);
    }

    if (arr.length < 2) return;

    // line
    const stroke = options.stroke || '#4f46e5';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    arr.forEach((p, i)=>{
      const x = pad.left + (i/(arr.length-1))*chartW;
      const y = pad.top + chartH - (Number(p.value||0)/max)*chartH;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // points
    ctx.fillStyle = stroke;
    arr.forEach((p,i)=>{
      const x = pad.left + (i/(arr.length-1))*chartW;
      const y = pad.top + chartH - (Number(p.value||0)/max)*chartH;
      ctx.beginPath();
      ctx.arc(x,y,3,0,Math.PI*2);
      ctx.fill();
    });

    // x labels (sparse)
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    const step = Math.ceil(arr.length/8);
    arr.forEach((p,i)=>{
      if (i % step !== 0 && i !== arr.length-1) return;
      const x = pad.left + (i/(arr.length-1))*chartW;
      ctx.fillText(String(p.label||''), x, H - 10);
    });
  }

  /**
   * Рендер круговой диаграммы.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {Array<{label:string, value:number}>} data
   */
  function renderPieChart(canvasOrId, data){
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    if (!canvas) return;
    fitCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    const arr = (data||[]).filter(d=>Number(d.value||0) > 0);
    const total = arr.reduce((s,d)=>s+Number(d.value||0),0);
    if (!total) {
      ctx.fillStyle='#94a3b8'; ctx.font='14px system-ui'; ctx.textAlign='center';
      ctx.fillText('Нет данных', W/2, H/2);
      return;
    }

    const cx=W/2, cy=H/2;
    const r = Math.min(W,H)/2 - 30;
    const colors = ['#4f46e5','#10b981','#f59e0b','#ef4444','#06b6d4','#64748b','#8b5cf6','#22c55e'];

    let angle = -Math.PI/2;
    arr.forEach((it, idx)=>{
      const slice = (Number(it.value||0)/total) * Math.PI*2;
      ctx.fillStyle = colors[idx % colors.length];
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,angle,angle+slice);
      ctx.closePath();
      ctx.fill();

      // label
      const mid = angle + slice/2;
      const lx = cx + Math.cos(mid)*(r+18);
      const ly = cy + Math.sin(mid)*(r+18);
      ctx.fillStyle = '#0f172a';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = (lx > cx) ? 'left' : 'right';
      const pct = Math.round((Number(it.value||0)/total)*100);
      ctx.fillText(`${it.label}: ${pct}%`, lx, ly);

      angle += slice;
    });
  }

  /**
   * Рендер вертикальной гистограммы.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {Array<{label:string, value:number}>} data
   * @param {{barColor?:string}} [options]
   */
  function renderBarChart(canvasOrId, data, options={}){
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    if (!canvas) return;
    fitCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    const pad = { top: 16, right: 12, bottom: 52, left: 46 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const arr = (data||[]);
    const max = Math.max(1, ...arr.map(d=>Number(d.value||0)));

    // axes
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    // y labels
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'right';
    for (let i=0;i<=4;i++){
      const v = (max/4)*i;
      const y = pad.top + chartH - (i/4)*chartH;
      ctx.fillText(formatNumber(v), pad.left - 8, y + 4);
    }

    if (!arr.length) return;
    const barColor = options.barColor || '#0ea5e9';
    const gap = 10;
    const barW = Math.max(10, (chartW - gap*(arr.length-1)) / arr.length);

    ctx.fillStyle = barColor;
    ctx.textAlign = 'center';
    arr.forEach((p,i)=>{
      const v = Number(p.value||0);
      const h = (v/max)*chartH;
      const x = pad.left + i*(barW + gap);
      const y = pad.top + chartH - h;
      ctx.fillRect(x, y, barW, h);

      // x label
      ctx.save();
      ctx.translate(x + barW/2, H - 10);
      ctx.rotate(-Math.PI/6);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px system-ui';
      ctx.fillText(String(p.label||''), 0, 0);
      ctx.restore();

      ctx.fillStyle = barColor;
    });
  }

  window.Charts = { renderLineChart, renderPieChart, renderBarChart };
})();

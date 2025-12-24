// js/pages/televisits.js
// Stage 3: full page module entry for Televisits (lazy-loaded by Router)
// Wrapper calls inlined controller and performs housekeeping to avoid leaks.

/**
 * Televisits page entry
 * @param {Object} params
 */
export default async function televisits(params = {}){
  // Cleanup any previous interval
  try { if (window.__tvInterval) { clearInterval(window.__tvInterval); window.__tvInterval = null; } } catch(_){ }

  // Pre-generate plan for today (TZ-aware) — best-effort
  try {
    const isoToday = (window.TZ && typeof window.TZ.todayISO === 'function') ? window.TZ.todayISO() : new Date().toISOString().slice(0,10);
    const base = (window.TZ && typeof window.TZ.parseISODate === 'function') ? window.TZ.parseISODate(isoToday) : new Date();
    await window.Scheduler?.generatePlannedVisits?.(base);
  } catch(_){ }

  // Delegate to existing controller
  try {
    if (window.Pages && typeof window.Pages.televisits === 'function'){
      await window.Pages.televisits(params);
      return;
    }
    console.warn('[Televisits] window.Pages.televisits is not available, nothing to run');
  } catch (e){
    console.error('[Televisits] controller error', e);
    try { window.Utils?.showToast?.('Ошибка загрузки телевизитов', 'error'); } catch(_){}
  }
}

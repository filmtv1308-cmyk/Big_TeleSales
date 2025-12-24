(function(){
  /**
   * TZ — управление часовым поясом на платформе.
   * Хранение: localStorage (ключ bts_tz), дополнительно синхронизируется с settings.timezone.
   * По умолчанию: Europe/Moscow.
   *
   * Важно: JS Date всегда хранит время в UTC, а отображение/вычисление "дня" зависит от TZ.
   * Мы используем Intl.DateTimeFormat(timeZone) для получения календарных компонентов.
   * @namespace TZ
   */
  const TZ = (()=>{
    const LS_KEY = 'bts_tz';
    const DEFAULT_TZ = 'Europe/Moscow';

    /** @returns {string} IANA timezone */
    function getTimeZone(){
      return String(localStorage.getItem(LS_KEY) || DEFAULT_TZ);
    }

    /**
     * Устанавливает часовой пояс.
     * @param {string} tz
     */
    function setTimeZone(tz){
      const val = String(tz || DEFAULT_TZ);
      localStorage.setItem(LS_KEY, val);
    }

    /**
     * Список TZ для выбора (можно расширять).
     * @returns {Array<{value:string,label:string}>}
     */
    function list(){
      return [
        { value:'Europe/Moscow', label:'Москва (Europe/Moscow) — UTC+3' },
        { value:'UTC', label:'UTC (без смещения)' },
        { value:'Europe/Kaliningrad', label:'Калининград (Europe/Kaliningrad) — UTC+2' },
        { value:'Europe/Samara', label:'Самара (Europe/Samara) — UTC+4' },
        { value:'Asia/Yekaterinburg', label:'Екатеринбург (Asia/Yekaterinburg) — UTC+5' },
        { value:'Asia/Omsk', label:'Омск (Asia/Omsk) — UTC+6' },
        { value:'Asia/Krasnoyarsk', label:'Красноярск (Asia/Krasnoyarsk) — UTC+7' },
        { value:'Asia/Irkutsk', label:'Иркутск (Asia/Irkutsk) — UTC+8' },
        { value:'Asia/Yakutsk', label:'Якутск (Asia/Yakutsk) — UTC+9' },
        { value:'Asia/Vladivostok', label:'Владивосток (Asia/Vladivostok) — UTC+10' },
        { value:'Asia/Magadan', label:'Магадан (Asia/Magadan) — UTC+11' },
        { value:'Asia/Kamchatka', label:'Камчатка (Asia/Kamchatka) — UTC+12' }
      ];
    }

    /**
     * Возвращает YYYY-MM-DD (календарная дата) для заданного момента в выбранном TZ.
     * @param {Date|number|string} date
     * @param {string} [tz]
     * @returns {string}
     */
    function isoDate(date, tz){
      const zone = tz || getTimeZone();
      const d = date instanceof Date ? date : new Date(date);
      const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
      const get = (type)=> parts.find(p=>p.type===type)?.value || '';
      return `${get('year')}-${get('month')}-${get('day')}`;
    }

    /** @returns {string} */
    function todayISO(){
      return isoDate(new Date());
    }

    /**
     * Парсит YYYY-MM-DD в Date (локальная дата) — удобно для циклов/итераций.
     * Важно: используется только как календарная дата (Y/M/D), не как абсолютное время.
     * @param {string} iso
     * @returns {Date|null}
     */
    function parseISODate(iso){
      const s = String(iso||'').trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const y = Number(m[1]), mo = Number(m[2])-1, d = Number(m[3]);
      const dt = new Date(y, mo, d);
      dt.setHours(0,0,0,0);
      return dt;
    }

    return { LS_KEY, DEFAULT_TZ, getTimeZone, setTimeZone, list, isoDate, todayISO, parseISODate };
  })();

  // Экспорт в глобальную область
  window.TZ = TZ;
})();

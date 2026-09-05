(function attachWandererClock(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.WandererClock = api;

    if (root.document) {
      const start = () => api.initBeijingClock(root.document, root);
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    }
  }
})(typeof window !== 'undefined' ? window : null, function createWandererClockApi() {
  const TIME_ZONE = 'Asia/Shanghai';
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const formatBeijingDateTime = (date = new Date()) => {
    const parts = formatter.formatToParts(date);
    const value = (type) => parts.find((part) => part.type === type)?.value ?? '';
    const year = value('year');
    const month = value('month');
    const day = value('day');
    const hour = value('hour');
    const minute = value('minute');
    const second = value('second');

    return {
      dateText: `${year}.${month}.${day} · ${value('weekday')}`,
      timeText: `${hour}:${minute}:${second}`,
      datetime: `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`,
    };
  };

  const initBeijingClock = (documentRef, timerHost = globalThis) => {
    const dateElement = documentRef?.querySelector('[data-current-date]');
    const timeElement = documentRef?.querySelector('[data-current-time]');
    if (!dateElement || !timeElement) return () => {};

    const render = () => {
      const value = formatBeijingDateTime();
      dateElement.textContent = value.dateText;
      dateElement.dateTime = value.datetime;
      timeElement.textContent = value.timeText;
    };

    render();
    const interval = timerHost.setInterval(render, 1000);
    return () => timerHost.clearInterval(interval);
  };

  return {
    formatBeijingDateTime,
    initBeijingClock,
  };
});

(function initCalendarModule(globalScope) {
  const pad = (value) => String(value).padStart(2, '0');

  const formatDateKey = (date) => (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  );

  const buildMonthDays = (year, monthIndex) => {
    const firstDay = new Date(year, monthIndex, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, monthIndex, 1 - mondayOffset + index);
      return {
        dateKey: formatDateKey(date),
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthIndex,
      };
    });
  };

  const validateInput = (input) => {
    const title = String(input.title ?? '').trim();
    if (!title) throw new Error('事件标题不能为空');

    return {
      date: String(input.date),
      title,
      note: String(input.note ?? '').trim(),
    };
  };

  const addEvent = (events, input, options = {}) => {
    const value = validateInput(input);
    const createId = options.createId ?? (() => (
      globalScope.crypto?.randomUUID?.() ?? `event-${Date.now()}`
    ));
    const now = options.now ?? (() => new Date().toISOString());

    return [...events, {
      id: createId(),
      ...value,
      createdAt: now(),
    }];
  };

  const updateEvent = (events, id, input) => {
    const current = events.find((event) => event.id === id);
    if (!current) return events;
    const value = validateInput({ ...input, date: current.date });

    return events.map((event) => (
      event.id === id ? { ...event, ...value } : event
    ));
  };

  const removeEvent = (events, id) => events.filter((event) => event.id !== id);
  const eventsForDate = (events, dateKey) => (
    events.filter((event) => event.date === dateKey)
  );

  const api = {
    addEvent,
    buildMonthDays,
    eventsForDate,
    formatDateKey,
    removeEvent,
    updateEvent,
  };

  globalScope.WandererCalendar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

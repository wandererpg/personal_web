(function initCalendarModule(globalScope) {
  const STORAGE_KEY = 'wanderer.calendar.events.v1';
  const pad = (value) => String(value).padStart(2, '0');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

  const isStoredEvent = (event) => Boolean(
    event
    && typeof event.id === 'string'
    && datePattern.test(event.date)
    && typeof event.title === 'string'
    && event.title.trim()
    && typeof event.note === 'string'
    && typeof event.createdAt === 'string'
  );

  const loadEvents = (storage) => {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isStoredEvent) : [];
    } catch {
      return [];
    }
  };

  const saveEvents = (storage, events) => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(events));
      return true;
    } catch {
      return false;
    }
  };

  const api = {
    addEvent,
    buildMonthDays,
    eventsForDate,
    formatDateKey,
    loadEvents,
    removeEvent,
    saveEvents,
    updateEvent,
  };

  globalScope.WandererCalendar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  const calendarRoot = globalScope.document?.querySelector('[data-calendar]');
  if (!calendarRoot) return;

  let storage;
  try {
    storage = globalScope.localStorage;
  } catch {
    storage = {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable'); },
    };
  }

  const today = new Date();
  const state = {
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth(),
    selectedDate: formatDateKey(today),
    events: loadEvents(storage),
  };

  const elements = {
    month: calendarRoot.querySelector('[data-calendar-month]'),
    grid: calendarRoot.querySelector('[data-calendar-grid]'),
    selectedDate: calendarRoot.querySelector('[data-calendar-selected-date]'),
    list: calendarRoot.querySelector('[data-calendar-event-list]'),
    form: calendarRoot.querySelector('[data-calendar-form]'),
    eventId: calendarRoot.querySelector('[data-calendar-event-id]'),
    title: calendarRoot.querySelector('[data-calendar-title]'),
    note: calendarRoot.querySelector('[data-calendar-note]'),
    error: calendarRoot.querySelector('[data-calendar-error]'),
    warning: calendarRoot.querySelector('[data-calendar-storage-warning]'),
    previous: calendarRoot.querySelector('[data-calendar-prev]'),
    next: calendarRoot.querySelector('[data-calendar-next]'),
    today: calendarRoot.querySelector('[data-calendar-today]'),
    add: calendarRoot.querySelector('[data-calendar-add]'),
    cancel: calendarRoot.querySelector('[data-calendar-cancel]'),
  };

  const humanDate = (dateKey) => new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${dateKey}T00:00:00`));

  const renderMonth = () => {
    elements.month.textContent = `${state.viewYear} 年 ${state.viewMonth + 1} 月`;
    elements.grid.setAttribute('aria-label', `${state.viewYear} 年 ${state.viewMonth + 1} 月`);
    const todayKey = formatDateKey(new Date());
    const buttons = buildMonthDays(state.viewYear, state.viewMonth).map((cell) => {
      const button = document.createElement('button');
      const count = eventsForDate(state.events, cell.dateKey).length;
      button.type = 'button';
      button.className = 'calendar-day';
      button.dataset.calendarDate = cell.dateKey;
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-selected', String(cell.dateKey === state.selectedDate));
      button.setAttribute(
        'aria-label',
        `${humanDate(cell.dateKey)}${count ? `，${count} 个事件` : ''}`,
      );
      button.classList.toggle('is-outside', !cell.inCurrentMonth);
      button.classList.toggle('is-today', cell.dateKey === todayKey);
      button.classList.toggle('is-selected', cell.dateKey === state.selectedDate);
      button.append(String(cell.day));

      if (count) {
        const badge = document.createElement('span');
        badge.className = 'calendar-day__count';
        badge.textContent = String(count);
        badge.setAttribute('aria-hidden', 'true');
        button.append(badge);
      }

      return button;
    });

    elements.grid.replaceChildren(...buttons);
  };

  const actionButton = (label, action, item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.calendarAction = action;
    button.dataset.eventId = item.id;
    button.setAttribute('aria-label', `${label}事件：${item.title}`);
    return button;
  };

  const renderEvents = () => {
    elements.selectedDate.textContent = humanDate(state.selectedDate);
    const dayEvents = eventsForDate(state.events, state.selectedDate);

    if (!dayEvents.length) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '这一天还没有事件。';
      elements.list.replaceChildren(empty);
      return;
    }

    const rows = dayEvents.map((item) => {
      const row = document.createElement('article');
      row.className = 'calendar-event';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.title;
      copy.append(title);

      if (item.note) {
        const note = document.createElement('p');
        note.textContent = item.note;
        copy.append(note);
      }

      const actions = document.createElement('div');
      actions.className = 'calendar-event__actions';
      actions.append(
        actionButton('编辑', 'edit', item),
        actionButton('删除', 'delete', item),
      );
      row.append(copy, actions);
      return row;
    });

    elements.list.replaceChildren(...rows);
  };

  const closeForm = () => {
    elements.form.hidden = true;
    elements.form.reset();
    elements.eventId.value = '';
    elements.error.hidden = true;
    elements.error.textContent = '';
  };

  const openForm = (item = null) => {
    elements.form.hidden = false;
    elements.eventId.value = item?.id ?? '';
    elements.title.value = item?.title ?? '';
    elements.note.value = item?.note ?? '';
    elements.error.hidden = true;
    elements.error.textContent = '';
    elements.title.focus();
  };

  const persistAndRender = () => {
    elements.warning.hidden = saveEvents(storage, state.events);
    renderMonth();
    renderEvents();
  };

  const selectViewedMonth = (date) => {
    state.viewYear = date.getFullYear();
    state.viewMonth = date.getMonth();
    state.selectedDate = formatDateKey(date);
    closeForm();
    renderMonth();
    renderEvents();
  };

  elements.previous.addEventListener('click', () => {
    selectViewedMonth(new Date(state.viewYear, state.viewMonth - 1, 1));
  });

  elements.next.addEventListener('click', () => {
    selectViewedMonth(new Date(state.viewYear, state.viewMonth + 1, 1));
  });

  elements.today.addEventListener('click', () => selectViewedMonth(new Date()));

  elements.grid.addEventListener('click', (domEvent) => {
    const target = domEvent.target.closest('[data-calendar-date]');
    if (!target) return;
    selectViewedMonth(new Date(`${target.dataset.calendarDate}T00:00:00`));
  });

  elements.add.addEventListener('click', () => openForm());
  elements.cancel.addEventListener('click', closeForm);

  elements.form.addEventListener('submit', (domEvent) => {
    domEvent.preventDefault();
    const input = {
      date: state.selectedDate,
      title: elements.title.value,
      note: elements.note.value,
    };

    try {
      state.events = elements.eventId.value
        ? updateEvent(state.events, elements.eventId.value, input)
        : addEvent(state.events, input);
      closeForm();
      persistAndRender();
    } catch (error) {
      elements.error.textContent = error instanceof Error ? error.message : '事件保存失败';
      elements.error.hidden = false;
    }
  });

  elements.list.addEventListener('click', (domEvent) => {
    const target = domEvent.target.closest('[data-calendar-action]');
    if (!target) return;
    const item = state.events.find((event) => event.id === target.dataset.eventId);
    if (!item) return;

    if (target.dataset.calendarAction === 'edit') {
      openForm(item);
      return;
    }

    if (target.dataset.calendarAction === 'delete' && window.confirm('删除这个事件？')) {
      state.events = removeEvent(state.events, item.id);
      closeForm();
      persistAndRender();
    }
  });

  renderMonth();
  renderEvents();
})(typeof window !== 'undefined' ? window : globalThis);

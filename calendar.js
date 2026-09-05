(function initCalendarModule(globalScope) {
  const STORAGE_KEY = 'wanderer.calendar.events.v1';
  const pad = (value) => String(value).padStart(2, '0');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
  const SCHOOL_CALENDAR_EVENTS = Object.freeze([
    Object.freeze({
      id: 'school-national-day-workday-2026-09-20',
      title: '国庆调休上班',
      start: '2026-09-20',
      end: '2026-09-20',
      type: 'workday',
    }),
    Object.freeze({
      id: 'school-mid-autumn-2026',
      title: '中秋节放假',
      start: '2026-09-25',
      end: '2026-09-27',
      type: 'holiday',
    }),
    Object.freeze({
      id: 'school-national-day-2026',
      title: '国庆节放假',
      start: '2026-10-01',
      end: '2026-10-07',
      type: 'holiday',
    }),
    Object.freeze({
      id: 'school-national-day-workday-2026-10-10',
      title: '国庆调休上班',
      start: '2026-10-10',
      end: '2026-10-10',
      type: 'workday',
    }),
    Object.freeze({
      id: 'school-student-winter-break-2027',
      title: '学生寒假',
      start: '2027-01-11',
      end: '2027-02-20',
      type: 'break',
    }),
    Object.freeze({
      id: 'school-student-registration-2027',
      title: '学生注册',
      start: '2027-02-21',
      end: '2027-02-21',
      type: 'school',
    }),
  ]);

  const formatDateKey = (date) => (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  );

  const dateKeyToUtc = (dateKey) => {
    if (!datePattern.test(dateKey)) return Number.NaN;
    const [year, month, day] = dateKey.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    const normalized = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    return normalized === dateKey ? timestamp : Number.NaN;
  };

  const expandDateRange = (start, end = start) => {
    const first = dateKeyToUtc(start);
    const last = dateKeyToUtc(end);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];

    return Array.from(
      { length: Math.floor((last - first) / DAY_IN_MILLISECONDS) + 1 },
      (_, index) => {
        const date = new Date(first + index * DAY_IN_MILLISECONDS);
        return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
      },
    );
  };

  const getSchoolCalendarEvents = () => SCHOOL_CALENDAR_EVENTS.map((event) => ({ ...event }));

  const schoolEventsForDate = (dateKey) => SCHOOL_CALENDAR_EVENTS
    .filter((event) => event.start <= dateKey && dateKey <= event.end)
    .map((event) => ({ ...event }));

  const getUpcomingEvents = (userEvents = [], todayKey = formatDateKey(new Date())) => {
    const personalEvents = (Array.isArray(userEvents) ? userEvents : [])
      .filter((event) => datePattern.test(event?.date) && event.date >= todayKey)
      .map((event) => ({
        id: event.id,
        title: event.title,
        start: event.date,
        end: event.date,
        type: 'personal',
        source: 'personal',
        note: event.note,
      }));
    const schoolEvents = SCHOOL_CALENDAR_EVENTS
      .filter((event) => event.end >= todayKey)
      .map((event) => ({ ...event, source: 'school' }));

    return [...personalEvents, ...schoolEvents]
      .sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title))
      .slice(0, 3);
  };

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
    expandDateRange,
    eventsForDate,
    formatDateKey,
    getSchoolCalendarEvents,
    getUpcomingEvents,
    loadEvents,
    removeEvent,
    saveEvents,
    schoolEventsForDate,
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
    upcomingList: globalScope.document.querySelector('[data-upcoming-list]'),
    upcomingEmpty: globalScope.document.querySelector('[data-upcoming-empty]'),
  };

  const humanDate = (dateKey) => new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${dateKey}T00:00:00`));

  const displayDate = (dateKey) => dateKey.replaceAll('-', '.');

  const displayDateRange = (start, end) => {
    if (start === end) return displayDate(start);
    const endLabel = end.startsWith(start.slice(0, 4)) ? end.slice(5).replace('-', '.') : displayDate(end);
    return `${displayDate(start)}—${endLabel}`;
  };

  const relativeLabel = (event, todayKey) => {
    if (event.start <= todayKey && event.end >= todayKey) return '进行中';
    const start = dateKeyToUtc(event.start);
    const today = dateKeyToUtc(todayKey);
    if (!Number.isFinite(start) || !Number.isFinite(today)) return '';
    const days = Math.round((start - today) / DAY_IN_MILLISECONDS);
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    return `${days} 天后`;
  };

  const scheduleMarker = (events) => {
    if (events.some((event) => event.type === 'workday')) return '班';
    if (events.some((event) => event.type === 'holiday' || event.type === 'break')) return '假';
    return '校';
  };

  const renderMonth = () => {
    elements.month.textContent = `${state.viewYear} 年 ${state.viewMonth + 1} 月`;
    elements.grid.setAttribute('aria-label', `${state.viewYear} 年 ${state.viewMonth + 1} 月`);
    const todayKey = formatDateKey(new Date());
    const buttons = buildMonthDays(state.viewYear, state.viewMonth).map((cell) => {
      const button = document.createElement('button');
      const userEvents = eventsForDate(state.events, cell.dateKey);
      const schoolEvents = schoolEventsForDate(cell.dateKey);
      const count = userEvents.length + schoolEvents.length;
      const scheduleNames = schoolEvents.map((event) => event.title).join('、');
      button.type = 'button';
      button.className = 'calendar-day';
      button.dataset.calendarDate = cell.dateKey;
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-selected', String(cell.dateKey === state.selectedDate));
      button.setAttribute(
        'aria-label',
        `${humanDate(cell.dateKey)}${scheduleNames ? `，校历：${scheduleNames}` : ''}${userEvents.length ? `，${userEvents.length} 个自定义事件` : ''}`,
      );
      button.classList.toggle('is-outside', !cell.inCurrentMonth);
      button.classList.toggle('is-today', cell.dateKey === todayKey);
      button.classList.toggle('is-selected', cell.dateKey === state.selectedDate);
      button.classList.toggle('is-holiday', schoolEvents.some((event) => event.type === 'holiday'));
      button.classList.toggle('is-workday', schoolEvents.some((event) => event.type === 'workday'));
      button.classList.toggle('is-break', schoolEvents.some((event) => event.type === 'break'));
      button.classList.toggle('is-school', schoolEvents.some((event) => event.type === 'school'));
      button.append(String(cell.day));

      if (schoolEvents.length) {
        const marker = document.createElement('span');
        marker.className = 'calendar-day__marker';
        marker.textContent = scheduleMarker(schoolEvents);
        marker.setAttribute('aria-hidden', 'true');
        button.append(marker);
      }

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

  const schoolEventRow = (item) => {
    const row = document.createElement('article');
    row.className = `calendar-event calendar-event--school calendar-event--${item.type}`;
    const copy = document.createElement('div');
    const titleLine = document.createElement('div');
    titleLine.className = 'calendar-event__titleline';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const source = document.createElement('span');
    source.className = 'calendar-event__source';
    source.textContent = '校历';
    titleLine.append(title, source);
    copy.append(titleLine);

    const range = document.createElement('p');
    range.className = 'calendar-event__meta';
    range.textContent = displayDateRange(item.start, item.end);
    copy.append(range);
    row.append(copy);
    return row;
  };

  const renderEvents = () => {
    elements.selectedDate.textContent = humanDate(state.selectedDate);
    const daySchoolEvents = schoolEventsForDate(state.selectedDate);
    const dayEvents = eventsForDate(state.events, state.selectedDate);

    if (!dayEvents.length && !daySchoolEvents.length) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '这一天还没有事件。';
      elements.list.replaceChildren(empty);
      return;
    }

    const personalRows = dayEvents.map((item) => {
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

    elements.list.replaceChildren(...daySchoolEvents.map(schoolEventRow), ...personalRows);
  };

  const renderUpcoming = () => {
    if (!elements.upcomingList) return;
    const items = getUpcomingEvents(state.events, formatDateKey(new Date()));
    const todayKey = formatDateKey(new Date());
    const rows = items.map((item) => {
      const row = document.createElement('li');
      row.className = `upcoming-event upcoming-event--${item.type}`;
      const top = document.createElement('div');
      top.className = 'upcoming-event__top';
      const title = document.createElement('strong');
      title.className = 'upcoming-event__title';
      title.textContent = item.title;
      const relative = document.createElement('span');
      relative.className = 'upcoming-event__relative';
      relative.textContent = relativeLabel(item, todayKey);
      top.append(title, relative);
      const date = document.createElement('span');
      date.className = 'upcoming-event__date';
      date.textContent = displayDateRange(item.start, item.end);
      row.append(top, date);
      return row;
    });

    elements.upcomingList.replaceChildren(...rows);
    if (elements.upcomingEmpty) elements.upcomingEmpty.hidden = items.length > 0;
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
    renderUpcoming();
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
  renderUpcoming();
})(typeof window !== 'undefined' ? window : globalThis);

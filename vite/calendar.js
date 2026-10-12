import { DAY_IN_MILLISECONDS, dateKeyToUtc, addEvent, buildMonthDays, eventsForDate, formatDateKey, getSchoolCalendarEvents, getUpcomingEvents, loadEvents, removeEvent, saveEvents, schoolEventsForDate, updateEvent } from './calendar-model.js';

export function initCalendar(globalScope = globalThis) {
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
      button.classList.toggle('has-events', count > 0);
      button.classList.toggle('is-holiday', schoolEvents.some((event) => event.type === 'holiday'));
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
        const dots = document.createElement('span');
        dots.className = 'calendar-day__dots';
        dots.setAttribute('aria-hidden', 'true');
        Array.from({ length: count }, () => {
          const dot = document.createElement('span');
          dot.className = 'calendar-day__dot';
          dots.append(dot);
        });
        button.append(dots);
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
}

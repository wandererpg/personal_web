(function initScheduleController(globalScope) {
  const document = globalScope.document;
  const model = globalScope.WandererSchedule;
  if (!document || !model) return;

  const schedulePage = document.querySelector('[data-schedule]');
  const summary = document.querySelector('[data-schedule-summary]');
  if (!schedulePage && !summary) return;

  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
  const state = {
    schedule: null,
    currentWeek: 1,
    viewWeek: 1,
    followCurrent: true,
    loading: true,
    error: false,
  };
  let refreshTimer = null;

  const one = selector => document.querySelector(selector);
  const text = (selector, value) => {
    const node = one(selector);
    if (node) node.textContent = value;
    return node;
  };

  const beijingDateKey = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const displayDate = dateKey => dateKey.replaceAll('-', '.');
  const displayRange = dates => dates.length
    ? `${displayDate(dates[0])}—${displayDate(dates[dates.length - 1])}`
    : '日期待设置';

  const createElement = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };

  const currentInfo = () => model.calculateWeek(beijingDateKey(), state.schedule || {});

  const getDatesForWeek = week => {
    if (!state.schedule?.termStart) return [];
    return model.getWeekDates(state.schedule.termStart, week);
  };

  const weekLabel = (week, info) => {
    if (info.state === 'unconfigured') return '尚未设置学期';
    if (info.state === 'before' && week === info.week) return `第 ${week} 周 · 未开学`;
    if (info.state === 'after' && week === info.week) return `第 ${week} 周 · 已结束`;
    return `第 ${week} 周`;
  };

  const renderCourse = course => {
    const block = createElement('article', `schedule-course schedule-course--${course.color}`);
    block.dataset.courseId = course.id;
    block.style.gridColumn = String(course.weekday + 1);
    block.style.gridRow = `${course.startPeriod + 1} / span ${course.endPeriod - course.startPeriod + 1}`;
    block.setAttribute('role', 'gridcell');

    const name = createElement('strong', 'schedule-course__name', course.name);
    const period = createElement('span', 'schedule-course__period', `第 ${course.startPeriod}–${course.endPeriod} 节 · ${model.periodRange(course)}`);
    const meta = createElement('span', 'schedule-course__meta');
    if (course.teacher) meta.append(createElement('span', '', course.teacher));
    if (course.room) meta.append(createElement('span', '', course.room));
    block.append(name, period, meta);
    block.setAttribute('aria-label', [course.name, course.teacher, course.room].filter(Boolean).join('，'));
    return block;
  };

  const renderGrid = () => {
    if (!schedulePage) return;
    const grid = schedulePage.querySelector('[data-schedule-grid]');
    const empty = schedulePage.querySelector('[data-schedule-empty]');
    if (!grid) return;
    grid.replaceChildren();

    const dates = getDatesForWeek(state.viewWeek);
    if (state.loading || state.error) {
      if (empty) empty.hidden = true;
      return;
    }
    if (!dates.length) {
      if (empty) empty.textContent = '请先在管理页设置学期开始日期。';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.textContent = '这一周还没有安排课程。';
    if (empty) empty.hidden = false;

    const corner = createElement('div', 'schedule-grid__corner', '节次');
    corner.setAttribute('aria-hidden', 'true');
    grid.append(corner);
    dates.forEach((dateKey, index) => {
      const day = createElement('div', 'schedule-day');
      day.classList.toggle('is-today', dateKey === beijingDateKey());
      day.append(
        createElement('span', 'schedule-day__name', `周${dayNames[index]}`),
        createElement('time', 'schedule-day__date', displayDate(dateKey)),
      );
      grid.append(day);
    });

    model.PERIODS.forEach(period => {
      const label = createElement('div', 'schedule-period');
      label.append(
        createElement('strong', '', String(period.index)),
        createElement('span', '', `${period.start}–${period.end}`),
      );
      grid.append(label);
      dates.forEach(() => grid.append(createElement('div', 'schedule-grid__cell')));
    });

    const visible = model.coursesForWeek(state.schedule?.courses || [], state.viewWeek);
    visible.forEach(course => grid.append(renderCourse(course)));
    if (empty) empty.hidden = visible.length > 0;
  };

  const renderPublic = () => {
    if (!schedulePage) return;
    const info = currentInfo();
    const dates = getDatesForWeek(state.viewWeek);
    const range = schedulePage.querySelector('[data-schedule-range]');
    const empty = schedulePage.querySelector('[data-schedule-empty]');
    const error = schedulePage.querySelector('[data-schedule-error]');
    text('[data-schedule-week]', weekLabel(state.viewWeek, info));
    if (range) range.textContent = displayRange(dates);
    text('[data-schedule-status]', state.loading
      ? '正在读取课表…'
      : state.error
        ? '连接中断'
        : info.state === 'unconfigured'
          ? '请从管理页设置学期开始日期'
          : `${model.coursesForWeek(state.schedule?.courses || [], state.viewWeek).length} 门课程`);
    if (error) error.hidden = !state.error;
    if (empty && state.error) empty.hidden = true;
    renderGrid();
    const previous = schedulePage.querySelector('[data-schedule-prev]');
    const next = schedulePage.querySelector('[data-schedule-next]');
    const maximum = state.schedule?.totalWeeks || 1;
    if (previous) previous.disabled = state.viewWeek <= 1;
    if (next) next.disabled = state.viewWeek >= maximum;
  };

  const renderSummary = () => {
    if (!summary) return;
    const list = summary.querySelector('[data-schedule-summary-list]');
    const empty = summary.querySelector('[data-schedule-summary-empty]');
    if (!list) return;
    const info = currentInfo();
    const dates = getDatesForWeek(info.week);
    const range = summary.querySelector('[data-schedule-summary-range]');
    const currentDay = model.currentWeekday(beijingDateKey());
    if (range) range.textContent = displayRange(dates);
    const weekCourses = model.coursesForWeek(state.schedule?.courses || [], info.week);
    const items = weekCourses
      .sort((left, right) => (left.weekday === currentDay ? -1 : 0) - (right.weekday === currentDay ? -1 : 0)
        || left.weekday - right.weekday || left.startPeriod - right.startPeriod)
      .slice(0, 5);
    list.replaceChildren(...items.map(course => {
      const item = createElement('li', `home-schedule__item home-schedule__item--${course.color}`);
      const copy = createElement('div', 'home-schedule__item-copy');
      copy.append(
        createElement('strong', '', course.name),
        createElement('span', '', [
          `周${dayNames[course.weekday - 1]}`,
          `${course.startPeriod}–${course.endPeriod} 节`,
          course.teacher,
          course.room,
        ].filter(Boolean).join(' · ')),
      );
      item.append(createElement('span', 'home-schedule__item-marker'), copy);
      return item;
    }));
    if (empty) {
      empty.textContent = state.error
        ? '课表暂时无法加载'
        : state.schedule?.termStart ? '本周暂无课程' : '尚未设置学期';
      empty.hidden = state.loading || items.length > 0;
    }
    const week = summary.querySelector('[data-schedule-summary-week]');
    if (week) week.textContent = weekLabel(info.week, info);
  };

  const render = () => {
    renderPublic();
    renderSummary();
  };

  const refreshCurrentWeek = () => {
    if (!state.schedule) return;
    const info = currentInfo();
    state.currentWeek = info.week;
    if (state.followCurrent) state.viewWeek = info.week;
    render();
  };

  const nextBeijingMondayDelay = () => {
    const today = beijingDateKey();
    const weekday = model.currentWeekday(today);
    const days = weekday === 1 ? 7 : 8 - weekday;
    const nextMonday = new Date(`${addDays(today, days)}T00:00:00+08:00`);
    return Math.max(1_000, nextMonday.getTime() - Date.now() + 250);
  };

  const addDays = (dateKey, days) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };

  const scheduleBoundaryRefresh = () => {
    if (refreshTimer) globalScope.clearTimeout(refreshTimer);
    refreshTimer = globalScope.setTimeout(() => {
      refreshCurrentWeek();
      scheduleBoundaryRefresh();
    }, nextBeijingMondayDelay());
  };

  const load = async () => {
    try {
      const response = await globalScope.fetch('/api/schedule', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      state.schedule = model.validateSchedule(payload.schedule);
      state.error = false;
      const info = currentInfo();
      state.currentWeek = info.week;
      state.viewWeek = info.week;
    } catch {
      state.error = true;
    } finally {
      state.loading = false;
      render();
      scheduleBoundaryRefresh();
    }
  };

  if (schedulePage) {
    schedulePage.querySelector('[data-schedule-prev]')?.addEventListener('click', () => {
      state.followCurrent = false;
      state.viewWeek = Math.max(1, state.viewWeek - 1);
      render();
    });
    schedulePage.querySelector('[data-schedule-next]')?.addEventListener('click', () => {
      state.followCurrent = false;
      state.viewWeek = Math.min(state.schedule?.totalWeeks || 1, state.viewWeek + 1);
      render();
    });
    schedulePage.querySelector('[data-schedule-current]')?.addEventListener('click', () => {
      state.followCurrent = true;
      refreshCurrentWeek();
    });
    schedulePage.querySelector('[data-schedule-settings-link]')?.addEventListener('click', () => {
      state.followCurrent = false;
    });
  }

  summary?.querySelector('[data-schedule-summary-link]')?.addEventListener('click', () => {
    state.followCurrent = false;
  });
  if (summary) {
    const summaryLink = summary.querySelector('[data-schedule-summary-link]');
    const openSummary = () => summaryLink?.click();
    summary.addEventListener('click', event => {
      if (event.target.closest('a, button')) return;
      openSummary();
    });
    summary.addEventListener('keydown', event => {
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openSummary();
      }
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshCurrentWeek();
  });

  render();
  void load();
}(typeof window !== 'undefined' ? window : globalThis));

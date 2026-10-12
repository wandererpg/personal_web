const STORAGE_KEY = 'wanderer.calendar.events.v1';
const pad = (value) => String(value).padStart(2, '0');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const SCHOOL_CALENDAR_EVENTS = Object.freeze([
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
    globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}`
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

export {
  DAY_IN_MILLISECONDS,
  dateKeyToUtc,
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

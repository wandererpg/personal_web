(function initScheduleModel(globalScope) {
  const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const COLORS = Object.freeze(['mint', 'pink', 'blue', 'orange']);
  const PERIODS = Object.freeze([
    { index: 1, start: '08:00', end: '08:45' },
    { index: 2, start: '08:55', end: '09:40' },
    { index: 3, start: '10:00', end: '10:45' },
    { index: 4, start: '10:55', end: '11:40' },
    { index: 5, start: '13:30', end: '14:15' },
    { index: 6, start: '14:25', end: '15:10' },
    { index: 7, start: '15:30', end: '16:15' },
    { index: 8, start: '16:35', end: '17:20' },
    { index: 9, start: '18:00', end: '18:45' },
    { index: 10, start: '18:55', end: '19:40' },
    { index: 11, start: '20:00', end: '20:45' },
    { index: 12, start: '20:55', end: '21:40' },
  ].map(period => Object.freeze(period)));
  const DEFAULT_SCHEDULE = Object.freeze({
    version: 1,
    termStart: '',
    totalWeeks: 20,
    courses: Object.freeze([]),
  });

  const createError = (message, code = 'SCHEDULE_VALIDATION') => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  const pad = value => String(value).padStart(2, '0');

  const dateKeyToUtc = dateKey => {
    if (typeof dateKey !== 'string' || !DATE_PATTERN.test(dateKey)) {
      throw createError('日期格式无效');
    }
    const [year, month, day] = dateKey.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    const normalized = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    if (normalized !== dateKey) throw createError('日期格式无效');
    return timestamp;
  };

  const utcToDateKey = timestamp => {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  };

  const addDays = (dateKey, days) => utcToDateKey(dateKeyToUtc(dateKey) + days * DAY_IN_MILLISECONDS);

  const currentWeekday = dateKey => {
    const day = new Date(dateKeyToUtc(dateKey)).getUTCDay();
    return day === 0 ? 7 : day;
  };

  const isMonday = dateKey => currentWeekday(dateKey) === 1;

  const integerField = (value, label, min, max) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
      throw createError(`${label}必须是 ${min}–${max} 的整数`);
    }
    return number;
  };

  const normalizeCourse = (input, totalWeeks) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw createError('课程数据无效');
    }
    const id = String(input.id ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!id) throw createError('课程编号不能为空');
    if (!name) throw createError('课程名称不能为空');

    const weekday = integerField(input.weekday, '星期', 1, 7);
    const startPeriod = integerField(input.startPeriod, '起始节次', 1, PERIODS.length);
    const endPeriod = integerField(input.endPeriod, '结束节次', 1, PERIODS.length);
    if (startPeriod > endPeriod) throw createError('起止节次无效');

    if (!Array.isArray(input.weeks) || input.weeks.length === 0) {
      throw createError('上课周次不能为空');
    }
    const weeks = [...new Set(input.weeks.map(week => integerField(week, '上课周次', 1, totalWeeks)))].sort((a, b) => a - b);
    const color = String(input.color ?? 'mint').trim();
    if (!COLORS.includes(color)) throw createError('课程颜色无效');

    return {
      id,
      name,
      teacher: String(input.teacher ?? '').trim(),
      room: String(input.room ?? '').trim(),
      weekday,
      startPeriod,
      endPeriod,
      weeks,
      color,
    };
  };

  const sharesWeek = (first, second) => first.weeks.some(week => second.weeks.includes(week));
  const overlaps = (first, second) => first.startPeriod <= second.endPeriod
    && second.startPeriod <= first.endPeriod;

  const validateSchedule = input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw createError('课表数据无效');
    }
    const version = Number(input.version ?? 1);
    if (version !== 1) throw createError('课表版本无效');

    const termStart = String(input.termStart ?? '').trim();
    if (termStart) {
      dateKeyToUtc(termStart);
      if (!isMonday(termStart)) throw createError('学期开始日期必须是周一');
    }
    const totalWeeks = integerField(input.totalWeeks ?? DEFAULT_SCHEDULE.totalWeeks, '总周数', 1, 60);
    if (!Array.isArray(input.courses)) throw createError('课程列表无效');

    const ids = new Set();
    const courses = input.courses.map(course => {
      const normalized = normalizeCourse(course, totalWeeks);
      if (ids.has(normalized.id)) throw createError('课程编号不能重复');
      ids.add(normalized.id);
      return normalized;
    });

    for (let firstIndex = 0; firstIndex < courses.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < courses.length; secondIndex += 1) {
        const first = courses[firstIndex];
        const second = courses[secondIndex];
        if (first.weekday === second.weekday && sharesWeek(first, second) && overlaps(first, second)) {
          throw createError(`课程时间冲突：${first.name} 与 ${second.name}`, 'SCHEDULE_CONFLICT');
        }
      }
    }

    return { version: 1, termStart, totalWeeks, courses };
  };

  const calculateWeek = (dateKey, term = DEFAULT_SCHEDULE) => {
    const termStart = String(term?.termStart ?? '').trim();
    if (!termStart) return { week: 1, state: 'unconfigured' };
    const date = dateKeyToUtc(dateKey);
    const start = dateKeyToUtc(termStart);
    const totalWeeks = integerField(term?.totalWeeks ?? DEFAULT_SCHEDULE.totalWeeks, '总周数', 1, 60);
    const offset = Math.floor((date - start) / DAY_IN_MILLISECONDS);
    if (offset < 0) return { week: 1, state: 'before' };
    const week = Math.floor(offset / 7) + 1;
    if (week > totalWeeks) return { week: totalWeeks, state: 'after' };
    return { week, state: 'active' };
  };

  const getWeekDates = (termStart, week) => {
    const normalizedWeek = integerField(week, '周次', 1, 60);
    const start = dateKeyToUtc(termStart);
    return Array.from({ length: 7 }, (_, index) => utcToDateKey(
      start + ((normalizedWeek - 1) * 7 + index) * DAY_IN_MILLISECONDS,
    ));
  };

  const sortCourses = courses => [...courses].sort((first, second) => (
    first.weekday - second.weekday
    || first.startPeriod - second.startPeriod
    || first.name.localeCompare(second.name, 'zh-CN')
  ));

  const coursesForWeek = (courses, week) => sortCourses(
    (Array.isArray(courses) ? courses : []).filter(course => Array.isArray(course.weeks) && course.weeks.includes(Number(week))),
  );

  const coursesForDate = (courses, dateKey, week) => {
    const weekday = currentWeekday(dateKey);
    return coursesForWeek(courses, week).filter(course => course.weekday === weekday);
  };

  const periodRange = course => {
    const first = PERIODS[course.startPeriod - 1];
    const last = PERIODS[course.endPeriod - 1];
    return first && last ? `${first.start}–${last.end}` : '';
  };

  const api = {
    COLORS,
    DEFAULT_SCHEDULE,
    PERIODS,
    calculateWeek,
    coursesForDate,
    coursesForWeek,
    currentWeekday,
    getWeekDates,
    periodRange,
    validateSchedule,
  };

  globalScope.WandererSchedule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));

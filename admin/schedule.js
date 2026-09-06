(function initAdminSchedule(globalScope) {
  const document = globalScope.document;
  const root = document?.querySelector('[data-admin-schedule]');
  const model = globalScope.WandererSchedule;
  const adminApi = globalScope.AdminApi;
  if (!document || !root || !model || !adminApi) return;

  const state = {
    schedule: null,
    selectedId: '',
    loading: true,
  };
  const one = selector => root.querySelector(selector);
  const all = selector => [...root.querySelectorAll(selector)];

  const elements = {
    settingsForm: one('[data-schedule-settings-form]'),
    courseAdd: one('[data-course-add]'),
    termStart: one('[data-term-start]'),
    totalWeeks: one('[data-total-weeks]'),
    list: one('[data-course-list]'),
    empty: one('[data-course-empty]'),
    count: one('[data-course-count]'),
    form: one('[data-course-form]'),
    formTitle: one('[data-course-form-title]'),
    courseId: one('[data-course-id]'),
    name: one('[data-course-name]'),
    teacher: one('[data-course-teacher]'),
    room: one('[data-course-room]'),
    weekday: one('[data-course-weekday]'),
    startPeriod: one('[data-course-start-period]'),
    endPeriod: one('[data-course-end-period]'),
    weeks: one('[data-course-weeks]'),
    formError: one('[data-course-form-error]'),
    delete: one('[data-course-delete]'),
    status: one('[data-schedule-save-state]'),
    error: one('[data-schedule-error]'),
  };

  const createElement = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };

  const setStatus = (value, tone = '') => {
    elements.status.textContent = value;
    elements.status.dataset.tone = tone;
  };

  const setError = (value = '') => {
    elements.error.textContent = value;
    elements.error.hidden = !value;
    elements.formError.textContent = value;
    elements.formError.hidden = !value;
  };

  const setFieldError = (name, value = '') => {
    const field = root.querySelector(`[data-course-error="${name}"]`);
    if (field) field.textContent = value;
  };

  const periodLabel = period => `第 ${period.index} 节 · ${period.start}–${period.end}`;

  const renderPeriodOptions = () => {
    for (const select of [elements.startPeriod, elements.endPeriod]) {
      select.replaceChildren(...model.PERIODS.map(period => {
        const option = createElement('option', '', periodLabel(period));
        option.value = String(period.index);
        return option;
      }));
    }
  };

  const allWeeks = () => Array.from({ length: Number(state.schedule?.totalWeeks) || 20 }, (_, index) => index + 1);

  const renderWeeks = (selected = []) => {
    const selectedSet = new Set(selected.map(Number));
    elements.weeks.replaceChildren(...allWeeks().map(week => {
      const label = createElement('label', 'schedule-admin__week');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(week);
      checkbox.dataset.courseWeek = '';
      checkbox.checked = selectedSet.has(week);
      const text = createElement('span', '', String(week));
      label.append(checkbox, text);
      return label;
    }));
  };

  const selectedWeeks = () => all('[data-course-week]:checked').map(input => Number(input.value));

  const renderSettings = () => {
    if (!state.schedule) return;
    elements.termStart.value = state.schedule.termStart || '';
    elements.totalWeeks.value = String(state.schedule.totalWeeks);
  };

  const formatCourseMeta = course => [
    `周${['一', '二', '三', '四', '五', '六', '日'][course.weekday - 1]}`,
    `${course.startPeriod}–${course.endPeriod} 节`,
    course.teacher,
    course.room,
    `${course.weeks.length} 周`,
  ].filter(Boolean).join(' · ');

  const courseRow = course => {
    const row = createElement('article', `schedule-admin__course schedule-admin__course--${course.color}`);
    const marker = createElement('span', 'schedule-admin__course-marker');
    const copy = createElement('div', 'schedule-admin__course-copy');
    copy.append(
      createElement('strong', '', course.name),
      createElement('span', '', formatCourseMeta(course)),
    );
    const actions = createElement('div', 'schedule-admin__course-actions');
    const edit = createElement('button', 'admin-button', '编辑');
    edit.type = 'button';
    edit.dataset.courseEdit = course.id;
    edit.setAttribute('aria-label', `编辑课程：${course.name}`);
    const remove = createElement('button', 'admin-button admin-button--danger-ghost', '删除');
    remove.type = 'button';
    remove.dataset.courseDelete = course.id;
    remove.setAttribute('aria-label', `删除课程：${course.name}`);
    actions.append(edit, remove);
    row.append(marker, copy, actions);
    return row;
  };

  const renderList = () => {
    const courses = [...(state.schedule?.courses || [])];
    elements.list.replaceChildren(...courses.map(courseRow));
    elements.empty.hidden = courses.length > 0;
    elements.count.textContent = `${courses.length} COURSES`;
  };

  const closeForm = () => {
    state.selectedId = '';
    elements.form.hidden = true;
    elements.form.reset();
    elements.courseId.value = '';
    elements.formError.hidden = true;
    elements.formError.textContent = '';
    setFieldError('name');
  };

  const openForm = (course = null) => {
    if (!state.schedule) {
      setError('课表仍在读取，请稍后再试。');
      setStatus('请稍候', 'pending');
      return;
    }
    state.selectedId = course?.id || '';
    elements.form.hidden = false;
    elements.formTitle.textContent = course ? '编辑课程' : '新增课程';
    elements.courseId.value = course?.id || '';
    elements.name.value = course?.name || '';
    elements.teacher.value = course?.teacher || '';
    elements.room.value = course?.room || '';
    elements.weekday.value = String(course?.weekday || 1);
    elements.startPeriod.value = String(course?.startPeriod || 1);
    elements.endPeriod.value = String(course?.endPeriod || 2);
    const selected = course?.weeks || allWeeks();
    renderWeeks(selected);
    all('[data-course-color]').forEach(input => {
      input.checked = input.value === (course?.color || 'mint');
    });
    elements.delete.hidden = !course;
    elements.formError.hidden = true;
    elements.formError.textContent = '';
    setFieldError('name');
    elements.name.focus();
  };

  const readCourse = () => ({
    id: elements.courseId.value || `course-${globalScope.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
    name: elements.name.value,
    teacher: elements.teacher.value,
    room: elements.room.value,
    weekday: Number(elements.weekday.value),
    startPeriod: Number(elements.startPeriod.value),
    endPeriod: Number(elements.endPeriod.value),
    weeks: selectedWeeks(),
    color: all('[data-course-color]').find(input => input.checked)?.value || 'mint',
  });

  const saveSchedule = async (next, successMessage = '已保存') => {
    setError();
    let normalized;
    try {
      normalized = model.validateSchedule(next);
    } catch (error) {
      setError(error.message);
      setStatus('保存失败', 'error');
      return false;
    }

    setStatus('保存中…', 'pending');
    try {
      const response = await adminApi.request('/api/admin/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: normalized }),
      });
      state.schedule = model.validateSchedule(response.schedule);
      renderSettings();
      renderList();
      setStatus(successMessage, 'saved');
      return true;
    } catch (error) {
      if (error.status === 401) {
        globalScope.location.replace('/admin/login');
        return false;
      }
      setError(error.code === 'SCHEDULE_CONFLICT'
        ? '课程时间冲突，请调整星期、节次或上课周次。'
        : '课表保存失败，请检查表单后重试。');
      setStatus('保存失败', 'error');
      return false;
    }
  };

  const saveCourse = async event => {
    event.preventDefault();
    if (!state.schedule) {
      setError('课表仍在读取，请稍后再试。');
      setStatus('请稍候', 'pending');
      return;
    }
    const course = readCourse();
    const courses = state.schedule.courses.some(item => item.id === course.id)
      ? state.schedule.courses.map(item => item.id === course.id ? course : item)
      : [...state.schedule.courses, course];
    if (await saveSchedule({ ...state.schedule, courses }, '课程已保存')) closeForm();
  };

  const saveSettings = async event => {
    event.preventDefault();
    const next = {
      ...state.schedule,
      termStart: elements.termStart.value,
      totalWeeks: Number(elements.totalWeeks.value),
    };
    await saveSchedule(next, '学期设置已保存');
    if (!elements.form.hidden) {
      const current = state.schedule.courses.find(course => course.id === state.selectedId);
      renderWeeks(current?.weeks || allWeeks());
    }
  };

  const deleteCourse = async id => {
    const course = state.schedule.courses.find(item => item.id === id);
    if (!course || !window.confirm(`确定删除「${course.name}」吗？`)) return;
    const courses = state.schedule.courses.filter(item => item.id !== id);
    if (await saveSchedule({ ...state.schedule, courses }, '课程已删除') && state.selectedId === id) closeForm();
  };

  const applyWeekAction = action => {
    const weeks = allWeeks();
    const selected = action === 'all'
      ? weeks
      : action === 'clear'
        ? []
        : weeks.filter(week => action === 'odd' ? week % 2 === 1 : week % 2 === 0);
    renderWeeks(selected);
  };

  const load = async () => {
    try {
      const response = await adminApi.request('/api/admin/schedule');
      state.schedule = model.validateSchedule(response.schedule);
      elements.courseAdd.disabled = false;
      renderSettings();
      renderPeriodOptions();
      renderList();
      setStatus('已连接 · 课表可编辑', 'saved');
    } catch (error) {
      if (error.status === 401) return globalScope.location.replace('/admin/login');
      setError('暂时无法读取课表，请检查服务状态后重试。');
      setStatus('读取失败', 'error');
    } finally {
      state.loading = false;
    }
  };

  one('[data-course-add]').addEventListener('click', () => openForm());
  elements.settingsForm.addEventListener('submit', saveSettings);
  elements.form.addEventListener('submit', saveCourse);
  all('[data-course-cancel]').forEach(button => button.addEventListener('click', closeForm));
  elements.delete.addEventListener('click', () => deleteCourse(state.selectedId));
  all('[data-weeks-action]').forEach(button => button.addEventListener('click', () => applyWeekAction(button.dataset.weeksAction)));
  elements.list.addEventListener('click', event => {
    const edit = event.target.closest('[data-course-edit]');
    if (edit) {
      const course = state.schedule.courses.find(item => item.id === edit.dataset.courseEdit);
      if (course) openForm(course);
      return;
    }
    const remove = event.target.closest('[data-course-delete]');
    if (remove) void deleteCourse(remove.dataset.courseDelete);
  });
  document.querySelector('[data-admin-logout]')?.addEventListener('click', async () => {
    await adminApi.request('/api/admin/logout', { method: 'POST' });
    globalScope.location.replace('/admin/login');
  });

  renderPeriodOptions();
  void load();
}(typeof window !== 'undefined' ? window : globalThis));

import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SCHEDULE, validateSchedule } from '../schedule-model.js';

function scheduleError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function createMemoryScheduleStore() {
  let current = validateSchedule(DEFAULT_SCHEDULE);

  return {
    async read() {
      return validateSchedule(current);
    },
    async write(schedule) {
      current = validateSchedule(schedule);
      return validateSchedule(current);
    },
  };
}

function createScheduleStore({ dataDir } = {}) {
  if (!dataDir) return createMemoryScheduleStore();

  const file = path.join(dataDir, 'schedule.json');

  async function read() {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      return validateSchedule(value);
    } catch (error) {
      if (error.code === 'ENOENT') return validateSchedule(DEFAULT_SCHEDULE);
      throw scheduleError('SCHEDULE_INVALID', '课表文件无效', error);
    }
  }

  async function write(schedule) {
    const normalized = validateSchedule(schedule);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await rename(temporary, file);
      return normalized;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw scheduleError('SCHEDULE_WRITE_FAILED', '课表保存失败', error);
    }
  }

  return { read, write };
}

export { createScheduleStore, scheduleError };

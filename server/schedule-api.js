const express = require('express');

function statusFor(error) {
  return {
    SCHEDULE_VALIDATION: 400,
    SCHEDULE_CONFLICT: 409,
    SCHEDULE_INVALID: 500,
    SCHEDULE_WRITE_FAILED: 500,
  }[error.code] || 500;
}

function handleError(error, _request, response, _next) {
  return response.status(statusFor(error)).json({ error: error.code || 'INTERNAL_ERROR' });
}

function createPublicScheduleRouter({ scheduleStore }) {
  const router = express.Router();
  router.get('/', async (_request, response, next) => {
    try {
      response.json({ schedule: await scheduleStore.read() });
    } catch (error) {
      next(error);
    }
  });
  router.use(handleError);
  return router;
}

function createAdminScheduleRouter({ scheduleStore, auth }) {
  const router = express.Router();
  router.get('/', async (_request, response, next) => {
    try {
      response.json({ schedule: await scheduleStore.read() });
    } catch (error) {
      next(error);
    }
  });
  router.put('/', auth.requireCsrf, async (request, response, next) => {
    try {
      response.json({ schedule: await scheduleStore.write(request.body?.schedule ?? request.body) });
    } catch (error) {
      next(error);
    }
  });
  router.use(handleError);
  return router;
}

module.exports = { createAdminScheduleRouter, createPublicScheduleRouter, statusFor };

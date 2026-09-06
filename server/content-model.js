const MODULES = Object.freeze(['projects', 'insights', 'learning']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRAFT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function contentError(code) {
  return Object.assign(new Error(code), { code });
}

function validateSlug(value) {
  if (typeof value !== 'string' || value.length > 96 || !SLUG_PATTERN.test(value)) {
    throw contentError('SLUG_INVALID');
  }
  return value;
}

function validateDraftId(value) {
  if (typeof value !== 'string' || !DRAFT_ID_PATTERN.test(value)) {
    throw contentError('DRAFT_ID_INVALID');
  }
  return value;
}

function validateModule(value) {
  if (!MODULES.includes(value)) throw contentError('MODULE_INVALID');
  return value;
}

function validateTags(value) {
  if (!Array.isArray(value) || value.length > 10
      || value.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 32)) {
    throw contentError('TAGS_INVALID');
  }
  return [...new Set(value.map(tag => tag.trim()))];
}

module.exports = {
  MODULES,
  contentError,
  validateDraftId,
  validateModule,
  validateSlug,
  validateTags
};

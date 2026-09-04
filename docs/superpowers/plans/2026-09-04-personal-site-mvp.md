# Personal Website MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable static personal website MVP for project sharing, knowledge sharing, platform links, and a concise personal introduction.

**Architecture:** Keep the site framework-free and content-first: three semantic HTML pages share one stylesheet and one small JavaScript file. The homepage is the entry point; project and knowledge pages provide independent list views, while future detail pages can be added without changing the visual system.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Node.js built-in test APIs, static hosting.

---

### Task 1: Create the static-site smoke test

**Files:**
- Create: `tests/site-smoke.mjs`

- [ ] **Step 1: Write the failing test**

Create a Node test that checks the required pages, shared assets, semantic landmarks, navigation targets, reduced-motion support, and absence of placeholder copy:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const exists = async (name) => access(new URL(name, root)).then(() => true, () => false);

test('required site files exist', async () => {
  for (const file of ['index.html', 'projects.html', 'notes.html', 'styles.css', 'script.js']) {
    assert.equal(await exists(file), true, `${file} is missing`);
  }
});

test('pages expose shared navigation and semantic landmarks', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /<header[\s>]/);
    assert.match(html, /<main[\s>]/);
    assert.match(html, /<footer[\s>]/);
    assert.match(html, /href="projects\.html"/);
    assert.match(html, /href="notes\.html"/);
    assert.match(html, /href="https:\/\//);
  }
});

test('styles include responsive and reduced-motion rules', async () => {
  const css = await read('styles.css');
  assert.match(css, /@media/);
  assert.match(css, /prefers-reduced-motion/);
});

test('pages do not ship unfinished placeholder copy', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.doesNotMatch(html, /lorem ipsum|TODO|TBD|coming soon/i);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL because the HTML pages and shared assets do not exist yet.

- [ ] **Step 3: Commit the test scaffold**

Run: `git add tests/site-smoke.mjs && git commit -m "test: define static site smoke checks"`

### Task 2: Build the shared C2 visual system

**Files:**
- Create: `styles.css`

- [ ] **Step 1: Define the visual tokens and global layout**

Add deep-space background colors, cyan/violet accents, system typography, monospace metadata, a centered responsive container, focus styles, skip link, and the page shell.

- [ ] **Step 2: Add the star field and orbital decoration**

Use CSS radial gradients and pseudo-elements for stars, a subtle grid, glow halos, and orbit lines. Keep decoration behind content with explicit stacking contexts.

- [ ] **Step 3: Add shared components**

Style the header, mobile navigation, eyebrow labels, hero, buttons, glass cards, project cards, note cards, platform link cards, status pills, and footer.

- [ ] **Step 4: Add responsive and reduced-motion behavior**

Collapse multi-column grids below tablet width, keep navigation usable on narrow screens, and disable nonessential transitions/animations under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Commit the visual system**

Run: `git add styles.css && git commit -m "feat: add deep space visual system"`

### Task 3: Implement the homepage

**Files:**
- Create: `index.html`
- Create: `script.js`

- [ ] **Step 1: Add document metadata and semantic shell**

Include the page title, description, viewport, theme color, relative page links, skip link, header navigation, main content, and footer.

- [ ] **Step 2: Add the C2 hero section**

Use the agreed copy: `/// WANDERER.OS`, `SIGNAL RECEIVED · PERSONAL STATION`, “探索、建造，然后发射出去。” and the short introduction. Add primary links to projects and notes.

- [ ] **Step 3: Add homepage content sections**

Add 2–3 sample project cards, 3 sample knowledge cards, and GitHub/Bilibili platform cards. Each card must have a clear label, short summary, and usable link target.

- [ ] **Step 4: Add minimal navigation behavior**

Implement a mobile menu button with `aria-expanded`, `aria-controls`, Escape-key closing, and close-on-link-click behavior. Keep the behavior optional so the page remains usable without JavaScript.

- [ ] **Step 5: Run the smoke test and commit**

Run: `node --test tests/site-smoke.mjs`

Expected: the required-file, landmark, responsive, and placeholder checks pass.

Run: `git add index.html script.js && git commit -m "feat: add personal site homepage"`

### Task 4: Implement project and knowledge pages

**Files:**
- Create: `projects.html`
- Create: `notes.html`

- [ ] **Step 1: Build the project listing page**

Reuse the shared header/footer and present project cards with status, description, tags, and source/demo links. Make the current sample entries visibly replaceable by real project content.

- [ ] **Step 2: Build the knowledge listing page**

Reuse the shared header/footer and present notes with category, date, title, summary, and article links. Keep the reading width comfortable and the card hierarchy scannable.

- [ ] **Step 3: Verify all internal links and commit**

Run: `node --test tests/site-smoke.mjs`

Expected: all tests pass.

Run: `git add projects.html notes.html && git commit -m "feat: add project and knowledge pages"`

### Task 5: Run final validation and visual QA

**Files:**
- Modify: `tests/site-smoke.mjs` only if a discovered invariant needs coverage

- [ ] **Step 1: Run the complete automated check**

Run: `node --test tests/site-smoke.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Serve the site locally**

Run: `npx --yes serve . -l 4173`

Expected: the static site is available at `http://localhost:4173`.

- [ ] **Step 3: Check desktop and mobile layouts**

Verify the homepage, project page, and knowledge page at desktop and narrow viewport widths. Confirm no text is clipped, the mobile navigation opens/closes, focus rings are visible, and external links have clear labels.

- [ ] **Step 4: Check reduced motion and failure-free navigation**

Enable reduced motion in the browser, reload each page, follow every navigation link, and confirm no console errors or missing-page errors appear.

- [ ] **Step 5: Commit any validation-only fixes**

Run: `git add . && git commit -m "test: verify personal site MVP"` only when a validation fix changed tracked files; otherwise leave the code unchanged.

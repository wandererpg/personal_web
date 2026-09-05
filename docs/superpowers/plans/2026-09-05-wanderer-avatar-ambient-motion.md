# Wanderer Avatar and Ambient Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage station planet with an accessible Wanderer avatar placeholder, add two-layer drifting stars across all pages, and restyle the station as a translucent breathing-nebula glass card.

**Architecture:** Keep the site dependency-free. Change only the homepage station markup, implement ambient motion with CSS pseudo-elements and keyframes, and preserve `liquid-glass.js` as the sole pointer-interaction module. Lock every visual requirement with `tests/site-smoke.mjs`, including reduced-motion and the existing station-centering regression.

**Tech Stack:** Semantic HTML5, CSS custom properties/pseudo-elements/keyframes, Node.js built-in test runner, local Chromium browser verification.

---

## File map

- `index.html`: owns the homepage station identity, avatar placeholder, and nebula layer markup.
- `styles.css`: owns the shared page starfield, translucent station material, avatar presentation, responsive behavior, and reduced-motion fallback.
- `tests/site-smoke.mjs`: owns static contracts for station semantics, ambient layers, transparency, animation hooks, and accessibility fallbacks.
- `liquid-glass.js`: remains unchanged; its pointer highlighter and card tilt continue to enhance `.station-panel`.

### Task 1: Replace the planet identity with Wanderer and an avatar placeholder

**Files:**
- Modify: `tests/site-smoke.mjs:213-262`
- Modify: `index.html:125-144`

- [ ] **Step 1: Write the failing station-markup test**

Append this test after the existing home-calendar tests in `tests/site-smoke.mjs`:

```js
test('home station presents wanderer with an accessible avatar placeholder', async () => {
  const html = await read('index.html');

  assert.match(html, /<span class="station-nebula" aria-hidden="true"><\/span>/);
  assert.match(html, /<div class="avatar-stage">/);
  assert.match(html, /class="avatar-placeholder" role="img" aria-label="Wanderer 头像占位符"/);
  assert.match(html, /<span aria-hidden="true">W<\/span>/);
  assert.match(html, /<small aria-hidden="true">AVATAR<\/small>/);
  assert.match(html, /<h2>wanderer<\/h2>/);
  assert.doesNotMatch(html, /class="planet(?:-stage)?"/);
  assert.doesNotMatch(html, /把好奇心，变成可见的东西。/);
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "home station presents wanderer"
```

Expected: FAIL because `index.html` still contains `.planet-stage`, `.planet`, and the old heading.

- [ ] **Step 3: Replace the station markup**

Replace the current `.station-panel` block in `index.html` with:

```html
<div class="station-panel liquid-glass" data-liquid-glass>
  <span class="station-nebula" aria-hidden="true"></span>
  <div class="station-topline">
    <span>WANDERER / PERSONAL STATION</span>
    <span>ONLINE</span>
  </div>
  <div class="station-content">
    <div class="avatar-stage">
      <div class="avatar-placeholder" role="img" aria-label="Wanderer 头像占位符">
        <span aria-hidden="true">W</span>
        <small aria-hidden="true">AVATAR</small>
      </div>
    </div>
    <div class="station-copy">
      <span class="section-label">A corner in the universe</span>
      <h2>wanderer</h2>
      <p>项目、实验、笔记，以及那些还在路上的答案。</p>
    </div>
  </div>
  <div class="station-footer">
    <span class="signal-line">SIGNAL STABLE</span>
    <span>SYS.01 / 2026</span>
  </div>
</div>
```

- [ ] **Step 4: Verify the markup contract and the complete suite**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "home station presents wanderer"
node --test tests/site-smoke.mjs tests/liquid-glass.test.mjs tests/calendar.test.mjs
```

Expected: the targeted test passes; the complete suite passes with zero failures.

- [ ] **Step 5: Commit the semantic station change**

```powershell
git add index.html tests/site-smoke.mjs
git commit -m "feat: replace station planet with wanderer avatar"
```

### Task 2: Add the shared two-layer drifting starfield

**Files:**
- Modify: `tests/site-smoke.mjs:213-280`
- Modify: `styles.css:65-98`
- Modify: `styles.css:131-135`

- [ ] **Step 1: Write the failing shared-background test**

Append this test after the station-markup test:

```js
test('all pages share two composited drifting star layers', async () => {
  const css = await read('styles.css');

  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /class="site-shell"/);
  }

  assert.match(css, /body::before\s*\{[^}]*animation:\s*cosmic-star-drift-near 18s linear infinite;/s);
  assert.match(css, /\.site-shell::before\s*\{[^}]*animation:\s*cosmic-star-drift-far 30s linear infinite;/s);
  assert.match(css, /@keyframes cosmic-star-drift-near/);
  assert.match(css, /@keyframes cosmic-star-drift-far/);
  assert.match(css, /\.site-shell::before\s*\{[^}]*pointer-events:\s*none;/s);
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "all pages share two composited drifting star layers"
```

Expected: FAIL because the current stars are static and `.site-shell::before` does not exist.

- [ ] **Step 3: Turn the existing body stars into the near layer**

Replace the current `body::before` rule in `styles.css` with:

```css
body::before {
  inset: -12vmax;
  opacity: 0.58;
  background-image:
    radial-gradient(circle at 8% 18%, rgba(255, 255, 255, 0.95) 0 1px, transparent 1.5px),
    radial-gradient(circle at 18% 78%, rgba(119, 230, 255, 0.85) 0 1px, transparent 1.6px),
    radial-gradient(circle at 29% 34%, rgba(255, 255, 255, 0.8) 0 1px, transparent 1.5px),
    radial-gradient(circle at 44% 11%, rgba(169, 140, 255, 0.9) 0 1px, transparent 1.6px),
    radial-gradient(circle at 67% 24%, rgba(119, 230, 255, 0.74) 0 1px, transparent 1.5px),
    radial-gradient(circle at 91% 42%, rgba(169, 140, 255, 0.78) 0 1px, transparent 1.6px);
  background-size: 180px 165px, 235px 215px, 285px 255px, 325px 295px, 375px 345px, 425px 385px;
  animation: cosmic-star-drift-near 18s linear infinite;
  will-change: transform;
}
```

- [ ] **Step 4: Add the far layer to `.site-shell`**

Add this rule immediately after `.site-shell`:

```css
.site-shell::before {
  position: fixed;
  z-index: -1;
  inset: -10vmax;
  opacity: 0.26;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 15% 30%, rgba(255, 255, 255, 0.9) 0 1px, transparent 1.4px),
    radial-gradient(circle at 65% 70%, rgba(119, 230, 255, 0.72) 0 1px, transparent 1.5px),
    radial-gradient(circle at 85% 20%, rgba(255, 255, 255, 0.82) 0 1px, transparent 1.4px);
  background-size: 250px 230px, 320px 290px, 390px 350px;
  content: '';
  animation: cosmic-star-drift-far 30s linear infinite;
  will-change: transform;
}
```

- [ ] **Step 5: Add transform-only keyframes**

Add these keyframes after the page-background rules:

```css
@keyframes cosmic-star-drift-near {
  to {
    transform: translate3d(68px, 48px, 0);
  }
}

@keyframes cosmic-star-drift-far {
  to {
    transform: translate3d(-44px, 28px, 0);
  }
}
```

- [ ] **Step 6: Verify the shared starfield test and full suite**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "all pages share two composited drifting star layers"
node --test tests/site-smoke.mjs tests/liquid-glass.test.mjs tests/calendar.test.mjs
git diff --check
```

Expected: both test commands pass; `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Commit the global ambient background**

```powershell
git add styles.css tests/site-smoke.mjs
git commit -m "style: add shared drifting starfield"
```

### Task 3: Build the translucent nebula card and avatar styling

**Files:**
- Modify: `tests/site-smoke.mjs:213-310`
- Modify: `styles.css:963-1135`
- Modify: `styles.css:1869-1886`
- Modify: `styles.css:1943-1970`

- [ ] **Step 1: Write the failing material and motion test**

Append this test after the shared-background test:

```js
test('wanderer station uses transparent nebula and avatar styling', async () => {
  const css = await read('styles.css');

  assert.match(css, /\.station-panel\s*\{[^}]*rgba\(20, 43, 89, 0\.44\)[^}]*rgba\(5, 10, 29, 0\.5\)/s);
  assert.match(css, /\.station-nebula\s*\{[^}]*animation:\s*station-nebula-turn 24s linear infinite;/s);
  assert.match(css, /\.station-nebula::before[\s\S]*?station-nebula-breathe 8s/s);
  assert.match(css, /\.station-nebula::after[\s\S]*?station-nebula-breathe 10s/s);
  assert.match(css, /\.avatar-placeholder\s*\{[^}]*border-radius:\s*50%;[^}]*animation:\s*avatar-breathe 5s/s);
  assert.match(css, /@keyframes station-nebula-breathe/);
  assert.match(css, /@keyframes avatar-breathe/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.station-nebula/s);
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "wanderer station uses transparent nebula"
```

Expected: FAIL because the station still uses the opaque planet material and has no avatar or nebula animation styles.

- [ ] **Step 3: Make the station material more transparent**

In `.station-panel`, replace its `border`, `background`, `box-shadow`, and `backdrop-filter` declarations with:

```css
  border: 1px solid rgba(157, 237, 255, 0.24);
  background:
    linear-gradient(145deg, rgba(20, 43, 89, 0.44), rgba(5, 10, 29, 0.5)),
    rgba(7, 13, 31, 0.18);
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.11),
    inset 0 -1px rgba(119, 230, 255, 0.05),
    0 22px 64px rgba(0, 0, 0, 0.2),
    0 0 34px rgba(119, 230, 255, 0.06);
  backdrop-filter: blur(18px) saturate(1.24);
```

Replace `.station-panel::before` with this glass-sheen layer:

```css
.station-panel::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.06), transparent 34% 72%, rgba(119, 230, 255, 0.045));
  content: '';
}
```

Keep the existing grid in `.station-panel::after`, reduce `opacity` to `0.15`, and add `z-index: 0`.

- [ ] **Step 4: Add the card-local nebula layer**

Add these rules after `.station-panel::after`:

```css
.station-nebula {
  position: absolute;
  z-index: 0;
  inset: -30%;
  border-radius: 50%;
  opacity: 0.25;
  pointer-events: none;
  background: conic-gradient(from 180deg, transparent, rgba(169, 140, 255, 0.22), transparent 35%, rgba(119, 230, 255, 0.18), transparent 70%);
  animation: station-nebula-turn 24s linear infinite;
}

.station-nebula::before,
.station-nebula::after {
  position: absolute;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  opacity: 0.3;
  filter: blur(52px);
  content: '';
}

.station-nebula::before {
  top: -60px;
  right: -20px;
  background: rgba(85, 86, 255, 0.7);
  animation: station-nebula-breathe 8s ease-in-out infinite alternate;
}

.station-nebula::after {
  bottom: -80px;
  left: -20px;
  background: rgba(20, 212, 210, 0.52);
  animation: station-nebula-breathe 10s ease-in-out -3s infinite alternate-reverse;
}
```

Change the existing content stacking rule to:

```css
.station-topline,
.station-content,
.station-footer {
  position: relative;
  z-index: 2;
}
```

- [ ] **Step 5: Replace the planet CSS with avatar CSS**

Remove the `.planet-stage`, `.planet-stage::before`, `.planet-stage::after`, `.planet`, `.planet::before`, and `.planet::after` rules. Insert this block in their place:

```css
.avatar-stage {
  position: relative;
  display: grid;
  min-height: 230px;
  place-items: center;
}

.avatar-placeholder {
  position: relative;
  z-index: 2;
  display: grid;
  width: 126px;
  height: 126px;
  place-items: center;
  border: 1px solid rgba(185, 243, 255, 0.76);
  border-radius: 50%;
  background:
    linear-gradient(145deg, rgba(119, 230, 255, 0.09), rgba(169, 140, 255, 0.11)),
    rgba(5, 10, 28, 0.38);
  box-shadow: inset 0 0 32px rgba(119, 230, 255, 0.1), 0 0 38px rgba(119, 230, 255, 0.16);
  backdrop-filter: blur(8px);
  animation: avatar-breathe 5s ease-in-out infinite;
}

.avatar-placeholder::before {
  position: absolute;
  inset: -11px;
  border: 1px dashed rgba(119, 230, 255, 0.36);
  border-radius: inherit;
  content: '';
}

.avatar-placeholder span {
  color: var(--cyan-soft);
  font: 700 46px/1 var(--mono);
  text-shadow: 0 0 24px rgba(119, 230, 255, 0.5);
}

.avatar-placeholder small {
  position: absolute;
  right: 0;
  bottom: 9px;
  left: 0;
  color: var(--muted);
  font: 600 7px/1 var(--mono);
  letter-spacing: 0.14em;
  text-align: center;
}
```

- [ ] **Step 6: Add the nebula and avatar keyframes**

Add these keyframes near the station styles:

```css
@keyframes station-nebula-breathe {
  to {
    opacity: 0.42;
    transform: translate3d(40px, 27px, 0) scale(1.18);
  }
}

@keyframes station-nebula-turn {
  to {
    transform: rotate(360deg) scale(1.08);
  }
}

@keyframes avatar-breathe {
  50% {
    transform: scale(1.03);
    box-shadow: inset 0 0 36px rgba(119, 230, 255, 0.13), 0 0 46px rgba(119, 230, 255, 0.2);
  }
}
```

- [ ] **Step 7: Update narrow-screen avatar sizing**

In the existing `@media (max-width: 680px)` block, replace `.planet-stage` with `.avatar-stage` and add:

```css
  .avatar-stage {
    min-height: 180px;
  }

  .avatar-placeholder {
    width: 104px;
    height: 104px;
  }
```

- [ ] **Step 8: Add an explicit reduced-motion fallback**

Inside the existing `@media (prefers-reduced-motion: reduce)` block, add:

```css
  body::before,
  .site-shell::before,
  .station-nebula,
  .station-nebula::before,
  .station-nebula::after,
  .avatar-placeholder {
    animation: none !important;
  }
```

- [ ] **Step 9: Verify material, accessibility, centering, and the full suite**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "wanderer station uses transparent nebula"
node --test tests/site-smoke.mjs --test-name-pattern "station glass card keeps desktop vertical centering"
node --test tests/site-smoke.mjs tests/liquid-glass.test.mjs tests/calendar.test.mjs
node --check liquid-glass.js
node --check calendar.js
node --check script.js
git diff --check
```

Expected: every command exits with code 0; no test, syntax, or whitespace failures are reported.

- [ ] **Step 10: Commit the station material and motion**

```powershell
git add styles.css tests/site-smoke.mjs
git commit -m "style: add translucent wanderer nebula card"
```

### Task 4: Browser verification and delivery

**Files:**
- Verify: `index.html`
- Verify: `projects.html`
- Verify: `notes.html`
- Verify: `styles.css`
- Test: `tests/site-smoke.mjs`

- [ ] **Step 1: Confirm the local preview is reachable**

Run:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4173/index.html' -UseBasicParsing | Select-Object StatusCode
```

Expected: `StatusCode` is `200`. If the preview server is not running, start a static server from the repository root and repeat this check.

Use this PowerShell command to start it in a hidden window:

```powershell
Start-Process -FilePath 'python' -ArgumentList '-m','http.server','4173' -WorkingDirectory (Get-Location) -WindowStyle Hidden
```

- [ ] **Step 2: Verify desktop behavior at 1440 × 1000**

Check all three pages in local Chromium and confirm:

1. Near and far stars drift at visibly different, slow speeds without exposing an empty edge.
2. The grid remains static while the stars move.
3. The station heading reads `wanderer` and the circular `W / AVATAR` placeholder replaces the planet.
4. Background stars remain faintly visible through the station card.
5. The card text maintains readable contrast.
6. Pointer hover still produces liquid-glass highlight and tilt.
7. The station top position changes by no more than 6px during hover; it must not jump downward.

- [ ] **Step 3: Verify mobile behavior at 390 × 844**

Confirm:

1. No horizontal scrolling appears on `index.html`, `projects.html`, or `notes.html`.
2. The avatar placeholder remains circular and does not overlap the station text.
3. Touch feedback releases normally and the page continues scrolling without interference.
4. The fixed music player does not cover essential station content.

- [ ] **Step 4: Verify reduced motion**

Enable `prefers-reduced-motion: reduce`, reload each page, and confirm:

1. Star drift, nebula movement, and avatar breathing are stopped.
2. Static stars, glass material, identity text, and all controls remain visible.
3. Navigation, calendar, links, and music controls remain usable.

- [ ] **Step 5: Add a regression test before any validation fix**

If browser verification finds a defect, add the smallest failing assertion to `tests/site-smoke.mjs`, run it to confirm the expected failure, apply only the required HTML/CSS fix, and rerun the complete suite. Commit such a fix with:

```powershell
git add index.html projects.html notes.html styles.css tests/site-smoke.mjs
git commit -m "fix: address ambient motion validation findings"
```

If verification finds no defect, do not create an empty commit.

- [ ] **Step 6: Run final checks and push**

Run:

```powershell
node --test tests/site-smoke.mjs tests/liquid-glass.test.mjs tests/calendar.test.mjs
node --check liquid-glass.js
node --check calendar.js
node --check script.js
git diff --check
git push origin master
git status --short --branch
```

Expected: all tests and syntax checks pass, the worktree is clean, `master` matches `origin/master`, and the new commits are present on GitHub.

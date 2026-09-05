# Liquid Glass Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全站主要卡片加入指针驱动的深空液态玻璃材质、即时按压反馈和可访问的减少动态模式。

**Architecture:** 新建独立 `liquid-glass.js`，将指针位置计算与 DOM 绑定分开，并通过 CSS 自定义属性把位置和倾斜值传给共享 `.liquid-glass` 材质。三个页面只增加统一脚本引用和 `data-liquid-glass` 标记；动态高光节点由脚本注入，因此不会占用已有伪元素。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Pointer Events、`requestAnimationFrame`、Node.js 内置测试运行器、Playwright/Chromium 浏览器验收。

---

## 文件结构

- Create: `liquid-glass.js` — 纯指针计算、卡片状态管理和全站初始化。
- Create: `tests/liquid-glass.test.mjs` — 指针坐标、倾斜边界和设备策略单元测试。
- Modify: `index.html` — 首页目标卡片标记与脚本引用。
- Modify: `projects.html` — 项目卡片、播放器标记与脚本引用。
- Modify: `notes.html` — 知识行卡片、播放器标记与脚本引用。
- Modify: `styles.css` — 共享玻璃材质、高光、交互状态、触摸与减少动态规则。
- Modify: `tests/site-smoke.mjs` — 全站接线、目标覆盖和样式边界测试。

### Task 1: 指针效果计算

**Files:**

- Create: `liquid-glass.js`
- Create: `tests/liquid-glass.test.mjs`

- [ ] **Step 1: 写失败的指针计算测试**

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { calculatePointerEffects, shouldTrackPointer } = require('../liquid-glass.js');

const rect = { left: 100, top: 50, width: 200, height: 100 };

test('center pointer produces centered light without tilt', () => {
  assert.deepEqual(calculatePointerEffects(200, 100, rect), {
    xPercent: 50,
    yPercent: 50,
    rotateX: 0,
    rotateY: 0,
  });
});

test('pointer effects clamp to the card and two-degree tilt', () => {
  assert.deepEqual(calculatePointerEffects(500, -100, rect), {
    xPercent: 100,
    yPercent: 0,
    rotateX: 2,
    rotateY: 2,
  });
});

test('continuous tracking is desktop-only and respects reduced motion', () => {
  assert.equal(shouldTrackPointer('mouse', false), true);
  assert.equal(shouldTrackPointer('touch', false), false);
  assert.equal(shouldTrackPointer('mouse', true), false);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/liquid-glass.test.mjs`  
Expected: FAIL，提示 `liquid-glass.js` 不存在或导出函数缺失。

- [ ] **Step 3: 实现最小纯函数模块**

```js
(function attachLiquidGlass(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WandererLiquidGlass = api;
})(typeof window !== 'undefined' ? window : null, function createLiquidGlassApi() {
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function calculatePointerEffects(clientX, clientY, rect, maxTilt = 2) {
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const x = clamp((clientX - rect.left) / width, 0, 1);
    const y = clamp((clientY - rect.top) / height, 0, 1);

    return {
      xPercent: x * 100,
      yPercent: y * 100,
      rotateX: (0.5 - y) * maxTilt * 2,
      rotateY: (x - 0.5) * maxTilt * 2,
    };
  }

  function shouldTrackPointer(pointerType, reducedMotion) {
    return pointerType === 'mouse' && !reducedMotion;
  }

  return { calculatePointerEffects, shouldTrackPointer };
});
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/liquid-glass.test.mjs`  
Expected: 3 tests PASS。

- [ ] **Step 5: 提交纯函数与测试**

```bash
git add liquid-glass.js tests/liquid-glass.test.mjs
git commit -m "feat: add liquid glass pointer model"
```

### Task 2: 全站卡片接线与状态管理

**Files:**

- Modify: `liquid-glass.js`
- Modify: `index.html`
- Modify: `projects.html`
- Modify: `notes.html`
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: 写失败的全站接线测试**

在 `tests/site-smoke.mjs` 增加：

```js
test('all primary glass surfaces load the shared interaction module', async () => {
  const expectedTargets = new Map([
    ['index.html', 11],
    ['projects.html', 4],
    ['notes.html', 4],
  ]);

  for (const [page, count] of expectedTargets) {
    const html = await read(page);
    assert.match(html, /<script src="liquid-glass\.js" defer><\/script>/);
    assert.equal((html.match(/data-liquid-glass/g) ?? []).length, count);
  }

  const glassJs = await read('liquid-glass.js');
  assert.match(glassJs, /requestAnimationFrame/);
  assert.match(glassJs, /pointerdown/);
  assert.match(glassJs, /pointercancel/);
  assert.match(glassJs, /liquid-glass__shine/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/site-smoke.mjs`  
Expected: FAIL，因为页面尚未引用脚本且没有 `data-liquid-glass`。

- [ ] **Step 3: 标记全部目标卡片并载入模块**

三个页面在 `script.js` 之前加入：

```html
<script src="liquid-glass.js" defer></script>
```

为以下元素统一增加 `class="... liquid-glass" data-liquid-glass`：

- `index.html`：1 个 `.music-player`、1 个 `.home-calendar`、1 个 `.station-panel`、3 个 `.project-card`、3 个 `.note-card`、2 个 `.link-card`。
- `projects.html`：1 个 `.music-player`、3 个 `.project-card`。
- `notes.html`：1 个 `.music-player`、3 个 `.note-row`。

- [ ] **Step 4: 实现可中断的 DOM 交互**

在工厂函数中保留 Task 1 的导出，并加入以下完整行为：

```js
  function setEffects(card, effects, allowTilt) {
    card.style.setProperty('--glass-x', `${effects.xPercent}%`);
    card.style.setProperty('--glass-y', `${effects.yPercent}%`);
    card.style.setProperty('--glass-rx', `${allowTilt ? effects.rotateX : 0}deg`);
    card.style.setProperty('--glass-ry', `${allowTilt ? effects.rotateY : 0}deg`);
  }

  function resetCard(card) {
    card.classList.remove('is-glass-active', 'is-glass-pressed');
    card.style.removeProperty('--glass-rx');
    card.style.removeProperty('--glass-ry');
  }

  function initGlassCard(card, win) {
    if (card.dataset.liquidGlassReady === 'true') return;
    card.dataset.liquidGlassReady = 'true';

    const shine = card.ownerDocument.createElement('span');
    shine.className = 'liquid-glass__shine';
    shine.setAttribute('aria-hidden', 'true');
    card.append(shine);

    const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let pendingEvent = null;

    const schedule = (event, allowTilt) => {
      pendingEvent = { clientX: event.clientX, clientY: event.clientY, allowTilt };
      if (frame) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        if (!pendingEvent) return;
        const effects = calculatePointerEffects(
          pendingEvent.clientX,
          pendingEvent.clientY,
          card.getBoundingClientRect(),
        );
        setEffects(card, effects, pendingEvent.allowTilt);
        pendingEvent = null;
      });
    };

    card.addEventListener('pointerenter', (event) => {
      if (!shouldTrackPointer(event.pointerType, reducedMotion.matches)) return;
      card.classList.add('is-glass-active');
      schedule(event, true);
    });

    card.addEventListener('pointermove', (event) => {
      if (!shouldTrackPointer(event.pointerType, reducedMotion.matches)) return;
      schedule(event, true);
    });

    card.addEventListener('pointerdown', (event) => {
      card.classList.add('is-glass-active', 'is-glass-pressed');
      schedule(event, shouldTrackPointer(event.pointerType, reducedMotion.matches));
    });

    const release = (event) => {
      card.classList.remove('is-glass-pressed');
      if (event.pointerType !== 'mouse' || reducedMotion.matches) {
        win.setTimeout(() => card.classList.remove('is-glass-active'), 180);
      }
    };

    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
    card.addEventListener('pointerleave', () => {
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      pendingEvent = null;
      resetCard(card);
    });
  }

  function initLiquidGlass(doc, win) {
    doc.querySelectorAll('[data-liquid-glass]').forEach((card) => initGlassCard(card, win));
  }

  if (root?.document) {
    const start = () => initLiquidGlass(root.document, root);
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }

  return {
    calculatePointerEffects,
    shouldTrackPointer,
    initGlassCard,
    initLiquidGlass,
  };
```

- [ ] **Step 5: 运行接线测试与语法检查**

Run: `node --test tests/liquid-glass.test.mjs tests/site-smoke.mjs && node --check liquid-glass.js`  
Expected: all tests PASS，语法检查无输出。

- [ ] **Step 6: 提交全站交互接线**

```bash
git add liquid-glass.js index.html projects.html notes.html tests/site-smoke.mjs
git commit -m "feat: wire liquid glass card interactions"
```

### Task 3: 深空玻璃材质、响应式规则与浏览器验收

**Files:**

- Modify: `styles.css`
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: 写失败的材质与动效边界测试**

在 `tests/site-smoke.mjs` 增加：

```js
test('liquid glass material provides responsive and reduced-motion feedback', async () => {
  const css = await read('styles.css');

  assert.match(css, /\.liquid-glass\s*\{[^}]*backdrop-filter:/s);
  assert.match(css, /\.liquid-glass__shine\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(css, /\.liquid-glass\.is-glass-active\s*\{[^}]*perspective\(900px\)/s);
  assert.match(css, /@media\s*\(hover:\s*none\)[\s\S]*?\.liquid-glass\.is-glass-active/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.liquid-glass[^}]*transform:\s*none\s*!important;/s);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/site-smoke.mjs`  
Expected: FAIL，因为共享材质规则尚未加入。

- [ ] **Step 3: 加入共享液态玻璃样式**

在通用卡片规则之后、响应式规则之前加入：

```css
.liquid-glass {
  --glass-x: 50%;
  --glass-y: 50%;
  --glass-rx: 0deg;
  --glass-ry: 0deg;
  --glass-scale: 1;
  isolation: isolate;
  overflow: hidden;
  backdrop-filter: blur(20px) saturate(1.18);
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.09),
    inset 0 -1px rgba(119, 230, 255, 0.05),
    0 20px 60px rgba(0, 0, 0, 0.2);
  transform-style: preserve-3d;
  transform-origin: center;
  will-change: transform;
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), border-color 220ms ease, box-shadow 220ms ease;
}

.liquid-glass__shine {
  position: absolute;
  z-index: 3;
  inset: -1px;
  border-radius: inherit;
  opacity: 0;
  pointer-events: none;
  background:
    radial-gradient(circle 220px at var(--glass-x) var(--glass-y), rgba(190, 246, 255, 0.2), rgba(119, 230, 255, 0.07) 34%, transparent 68%),
    linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent 38% 64%, rgba(169, 140, 255, 0.08));
  mix-blend-mode: screen;
  transition: opacity 180ms ease;
}

.liquid-glass.is-glass-active {
  border-color: rgba(157, 237, 255, 0.48);
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.14),
    inset 0 -1px rgba(119, 230, 255, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.28),
    0 0 34px rgba(119, 230, 255, 0.1);
  transform: perspective(900px) rotateX(var(--glass-rx)) rotateY(var(--glass-ry)) translateY(-4px) scale(var(--glass-scale));
  transition-duration: 90ms, 180ms, 180ms;
}

.liquid-glass.is-glass-active .liquid-glass__shine {
  opacity: 1;
}

.liquid-glass.is-glass-pressed {
  --glass-scale: 0.99;
}

@media (hover: none), (pointer: coarse) {
  .liquid-glass.is-glass-active {
    transform: scale(var(--glass-scale));
  }
}
```

在现有 `@media (prefers-reduced-motion: reduce)` 内加入：

```css
  .liquid-glass,
  .liquid-glass.is-glass-active,
  .liquid-glass.is-glass-pressed {
    transform: none !important;
    will-change: auto;
  }

  .liquid-glass__shine {
    transition: none;
  }
```

- [ ] **Step 4: 运行全部自动化验证**

Run: `node --test tests/liquid-glass.test.mjs tests/calendar.test.mjs tests/site-smoke.mjs`  
Expected: all tests PASS。

Run: `node --check liquid-glass.js && node --check calendar.js && node --check script.js`  
Expected: no output and exit code 0。

Run: `git diff --check`  
Expected: no whitespace errors。

- [ ] **Step 5: 使用 Chromium 做真实浏览器验收**

桌面端 `1440×1000`：

- 打开首页，移动到项目卡片中心和四角；确认 `.is-glass-active`、高光位置变量和最大 `2deg` 倾斜。
- 按下并松开；确认 `.is-glass-pressed` 立即添加并移除。
- 移出卡片；确认活动状态复位，原链接仍可用。
- 检查日历、空间站和播放器均产生相同反馈，控制台无错误。

移动端 `390×844`：

- 模拟 touch 指针；确认只有高光和 `0.99` 按压反馈，没有持续倾斜。
- 确认页面宽度不超过视口，日历和播放器操作正常。

减少动态模式：

- 使用 `reducedMotion: 'reduce'` 打开页面并触发卡片；确认计算样式 `transform: none`。

- [ ] **Step 6: 提交材质样式与验收测试**

```bash
git add styles.css tests/site-smoke.mjs
git commit -m "style: add responsive liquid glass material"
```

- [ ] **Step 7: 推送并确认仓库同步**

Run: `git push origin master && git status --short --branch`  
Expected: push succeeds，状态显示 `master...origin/master` 且工作区干净。

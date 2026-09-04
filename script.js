const pageRoot = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pageTransitionDuration = 220;

pageRoot.classList.add('is-entering');
if (reducedMotion) {
  pageRoot.classList.remove('is-entering');
} else {
  window.requestAnimationFrame(() => pageRoot.classList.remove('is-entering'));
}

const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');

const closeMenu = () => {
  if (!menuToggle || !siteNav) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', '打开导航菜单');
  siteNav.classList.remove('is-open');
};

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? '打开导航菜单' : '关闭导航菜单');
    siteNav.classList.toggle('is-open', !isOpen);
  });

  siteNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 680) closeMenu();
  });
}

let isLeaving = false;

document.addEventListener('click', (event) => {
  if (
    isLeaving ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) return;

  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link || link.hasAttribute('download')) return;
  if (link.target && link.target.toLowerCase() !== '_self') return;

  const destination = new URL(link.href, window.location.href);
  if (destination.origin !== window.location.origin) return;
  if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
  if (!/\.html$/i.test(destination.pathname)) return;

  event.preventDefault();
  isLeaving = true;
  closeMenu();

  if (reducedMotion) {
    window.location.assign(destination.href);
    return;
  }

  pageRoot.classList.remove('is-entering');
  pageRoot.classList.add('is-leaving');
  window.setTimeout(() => window.location.assign(destination.href), pageTransitionDuration);
});

const year = document.querySelector('[data-current-year]');
if (year) year.textContent = String(new Date().getFullYear());

const revealItems = document.querySelectorAll('.reveal');

if (revealItems.length && 'IntersectionObserver' in window && !reducedMotion) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const musicPlayer = document.querySelector('[data-music-player]');
const musicToggle = musicPlayer?.querySelector('[data-music-toggle]');
const musicStatus = musicPlayer?.querySelector('[data-music-status]');
const ambientNotes = [146.83, 174.61, 220, 261.63, 293.66, 329.63];
const ambientMelody = [0, 2, 4, 3, 1, 4, 2, 5];
const audioState = {
  context: null,
  output: null,
  timer: null,
  step: 0,
  playing: false,
};
let musicBusy = false;

const updateMusicUI = (playing, status) => {
  if (!musicPlayer || !musicToggle || !musicStatus) return;
  musicPlayer.classList.toggle('is-playing', playing);
  musicToggle.setAttribute('aria-pressed', String(playing));
  musicToggle.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
  musicStatus.textContent = status;
};

const closeAudioContext = async (status = '点击播放 · 浏览器合成音') => {
  window.clearTimeout(audioState.timer);
  audioState.timer = null;
  audioState.playing = false;

  const context = audioState.context;
  audioState.context = null;
  audioState.output = null;
  audioState.step = 0;

  if (context && context.state !== 'closed') {
    try {
      await context.close();
    } catch {
      // The browser may already have closed the context during navigation.
    }
  }

  updateMusicUI(false, status);
};

const playTone = (frequency, startTime, duration, volume, type = 'sine') => {
  const context = audioState.context;
  const output = audioState.output;
  if (!context || !output) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
};

const scheduleAmbientPhrase = () => {
  const context = audioState.context;
  if (!context || !audioState.playing) return;

  const startTime = context.currentTime + 0.05;
  const noteIndex = ambientMelody[audioState.step % ambientMelody.length];
  const frequency = ambientNotes[noteIndex];
  playTone(frequency, startTime, 1.55, 0.024);

  if (audioState.step % 4 === 0) {
    playTone(frequency / 2, startTime, 2.2, 0.011, 'triangle');
  }

  audioState.step += 1;
  audioState.timer = window.setTimeout(scheduleAmbientPhrase, 1200);
};

const startAmbient = async () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    updateMusicUI(false, '当前浏览器不支持音频');
    return;
  }

  const context = new AudioContext();
  const filter = context.createBiquadFilter();
  const master = context.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.4;
  master.gain.value = 0.8;
  master.connect(filter);
  filter.connect(context.destination);
  audioState.context = context;
  audioState.output = master;
  audioState.step = 0;

  try {
    await context.resume();
    audioState.playing = true;
    updateMusicUI(true, '正在播放 · 浏览器合成音');
    scheduleAmbientPhrase();
  } catch {
    await closeAudioContext('音频启动失败，请重试');
  }
};

if (musicToggle) {
  musicToggle.addEventListener('click', async () => {
    if (musicBusy) return;
    musicBusy = true;

    try {
      if (audioState.playing) {
        await closeAudioContext();
      } else {
        await startAmbient();
      }
    } finally {
      musicBusy = false;
    }
  });

  window.addEventListener('pagehide', () => {
    if (audioState.context && audioState.context.state !== 'closed') {
      void audioState.context.close();
    }
  });
}

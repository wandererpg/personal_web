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
const musicTitle = musicPlayer?.querySelector('[data-music-title]');
const musicStatus = musicPlayer?.querySelector('[data-music-status]');
const musicSelect = musicPlayer?.querySelector('[data-music-select]');
const musicAudio = musicPlayer?.querySelector('[data-music-audio]');
const defaultTrackIndex = 2;
const tracks = [
  {
    title: '花弁となり 世界は大いに歌う',
    file: 'music/松本文紀 - 花弁となり 世界は大いに歌う.mp3',
  },
  {
    title: '夢の歩みを見上げて',
    file: 'music/松本文紀 - 夢の歩みを見上げて (仰望梦想的脚步).mp3',
  },
  {
    title: '夜の向日葵',
    file: 'music/松本文紀 - 夜の向日葵.flac',
  },
  {
    title: '月の眼球譚',
    file: 'music/松本文紀 - 月の眼球譚.mp3',
  },
];
const audioState = {
  index: defaultTrackIndex,
  playing: false,
};
let musicBusy = false;
let autoplayBlocked = false;

const updateMusicUI = (playing, status) => {
  if (!musicPlayer || !musicToggle || !musicStatus) return;
  const track = tracks[audioState.index];
  musicPlayer.classList.toggle('is-playing', playing);
  musicToggle.setAttribute('aria-pressed', String(playing));
  musicToggle.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
  if (musicTitle && track) musicTitle.textContent = track.title;
  musicStatus.textContent = status;
};

const encodeTrackPath = (file) => file.split('/').map(encodeURIComponent).join('/');

const playCurrentTrack = async () => {
  if (!musicAudio) return;

  try {
    await musicAudio.play();
    autoplayBlocked = false;
    audioState.playing = true;
    updateMusicUI(true, '正在播放');
  } catch (error) {
    audioState.playing = false;
    autoplayBlocked = error?.name === 'NotAllowedError';
    updateMusicUI(
      false,
      error?.name === 'NotAllowedError'
        ? '自动播放被拦截 · 点击页面启用声音'
        : '播放失败 · 请检查音频文件',
    );
  }
};

const loadTrack = async (index, autoplay = false) => {
  const track = tracks[index];
  if (!musicAudio || !track) return;

  audioState.playing = false;
  musicAudio.pause();
  audioState.index = index;
  if (musicSelect) musicSelect.value = String(index);
  musicAudio.src = encodeTrackPath(track.file);
  musicAudio.load();
  updateMusicUI(false, '已选曲目 · 点击播放');

  if (autoplay) await playCurrentTrack();
};

const handleAutoplayRecovery = (event) => {
  if (!autoplayBlocked || musicBusy) return;
  if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
  if (event.target instanceof Element && event.target.closest('[data-music-select]')) return;
  void playCurrentTrack();
};

if (musicPlayer && musicToggle && musicSelect && musicAudio) {
  musicAudio.volume = 0.58;
  void loadTrack(defaultTrackIndex, true);
  document.addEventListener('click', handleAutoplayRecovery);
  document.addEventListener('keydown', handleAutoplayRecovery);

  musicToggle.addEventListener('click', async () => {
    if (musicBusy) return;
    musicBusy = true;

    try {
      if (musicAudio.paused) {
        await playCurrentTrack();
      } else {
        musicAudio.pause();
        audioState.playing = false;
        updateMusicUI(false, '已暂停 · 点击播放');
      }
    } finally {
      musicBusy = false;
    }
  });

  musicSelect.addEventListener('change', async () => {
    if (musicBusy) return;
    musicBusy = true;

    try {
      await loadTrack(Number(musicSelect.value), audioState.playing || autoplayBlocked);
    } finally {
      musicBusy = false;
    }
  });

  musicAudio.addEventListener('play', () => {
    audioState.playing = true;
    updateMusicUI(true, '正在播放');
  });

  musicAudio.addEventListener('pause', () => {
    audioState.playing = false;
    if (!musicAudio.ended) updateMusicUI(false, '已暂停 · 点击播放');
  });

  musicAudio.addEventListener('ended', () => {
    const nextIndex = (audioState.index + 1) % tracks.length;
    void loadTrack(nextIndex, true);
  });

  musicAudio.addEventListener('error', () => {
    audioState.playing = false;
    updateMusicUI(false, '文件加载失败 · 可换一首');
  });

  window.addEventListener('pagehide', () => {
    musicAudio.pause();
  });
}

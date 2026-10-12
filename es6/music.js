export function initMusicPlayer() {
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
      autoplayBlocked = ['NotAllowedError', 'AbortError'].includes(error?.name);
      updateMusicUI(
        false,
        autoplayBlocked
          ? '自动播放未授权 · 点击页面开启声音'
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
    document.addEventListener('pointerdown', handleAutoplayRecovery, { passive: true });
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
}

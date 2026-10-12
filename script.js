export function initSiteInteractions() {
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
}

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Express keeps ownership of the API, the session, and public content during development.
const backendOrigin = process.env.BLOG_BACKEND_ORIGIN || 'http://127.0.0.1:3002';
const backendPaths = ['/api', '/posts', '/assets', '/music'];
const proxy = Object.fromEntries(backendPaths.map(prefix => [prefix, { target: backendOrigin }]));

const page = name => fileURLToPath(new URL(name, import.meta.url));

// Public pages live at the root; the admin area uses extensionless URLs that Express serves.
const adminAliases = {
  '/admin': '/admin/index.html',
  '/admin/': '/admin/index.html'
};

function adminPageAliases() {
  const rewrite = (req, _res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const [pathname, search] = (req.url || '').split('?');
    const suffix = search ? `?${search}` : '';
    if (adminAliases[pathname]) {
      req.url = `${adminAliases[pathname]}${suffix}`;
    } else if (pathname.startsWith('/admin/') && !pathname.includes('.')) {
      req.url = `${pathname}.html${suffix}`;
    }
    next();
  };
  return {
    name: 'wanderer-admin-page-aliases',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); }
  };
}

export default defineConfig({
  appType: 'mpa',
  // The site has no copied public assets: repository content is served by Express.
  publicDir: false,
  plugins: [adminPageAliases()],
  build: {
    // `/assets` already serves repository content, so bundles are emitted under `/static`.
    assetsDir: 'static',
    rollupOptions: {
      input: {
        index: page('index.html'),
        notes: page('notes.html'),
        post: page('post.html'),
        projects: page('projects.html'),
        schedule: page('schedule.html'),
        'admin/index': page('admin/index.html'),
        'admin/login': page('admin/login.html'),
        'admin/editor': page('admin/editor.html'),
        'admin/schedule': page('admin/schedule.html'),
        'admin/guestbook': page('admin/guestbook.html')
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy
  }
});

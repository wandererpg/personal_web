import { initCalendar } from './calendar.js';
import { initBeijingClock } from './clock.js';
import { initLiquidGlass } from './liquid-glass.js';
import { initBlogArchive, initBlogArticle, initBlogPreview } from './blog.js';
import { initGuestbook } from './guestbook.js';
import { initScheduleController } from './schedule.js';
import { initSiteInteractions } from './script.js';
import { initMusicPlayer } from './music.js';

// Module scripts run after HTML parsing. Each feature checks for its own DOM hooks.
initCalendar(window);
initBeijingClock(document, window);
initLiquidGlass(document, window);
initBlogPreview(document, window);
initBlogArchive(document, window);
initBlogArticle(document, window);
initGuestbook(window);
initSiteInteractions();
initMusicPlayer();
initScheduleController(window);

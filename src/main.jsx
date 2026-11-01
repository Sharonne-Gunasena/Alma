import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.jsx';
import './index.css';
import { watchSystemTheme } from './lib/theme.js';
import { preloadIntro } from './ui/anim.js';

watchSystemTheme();
preloadIntro();

// reducedMotion="user": Motion animations become instant for people who turn
// motion off, on every screen (sign-in and legal pages included).
const render = () =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </StrictMode>,
  );

// The portfolio embeds the app at #/demo: load sample data into guest mode first, then show the app.
if (window.location.hash === '#/demo') {
  import('./lib/demo.js').then(({ enterDemo }) => enterDemo()).finally(render);
} else {
  render();
}

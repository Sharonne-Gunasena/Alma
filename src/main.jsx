import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const render = () =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// The portfolio embeds the app at #/demo: load sample data into guest mode first, then show the app.
if (window.location.hash === '#/demo') {
  import('./lib/demo.js').then(({ enterDemo }) => enterDemo()).finally(render);
} else {
  render();
}

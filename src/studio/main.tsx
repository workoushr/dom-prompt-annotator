import React from 'react';
import ReactDOM from 'react-dom/client';
import { StudioApp } from './StudioApp';
import '../sidepanel/styles.css';
import 'rrweb/dist/style.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StudioApp />
    </React.StrictMode>
  );
}

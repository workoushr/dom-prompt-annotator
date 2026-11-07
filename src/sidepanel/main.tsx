import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

export function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <h1 className="text-lg font-semibold">DOM Prompt Annotator</h1>
      <p className="text-xs text-slate-400 mt-1">
        Inspect DOM elements, attach numbered instructions, mask sensitive data, and export AI-ready prompts.
      </p>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

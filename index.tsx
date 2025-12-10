
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress benign ResizeObserver error usually caused by rapid layout changes in ReactFlow or containers
const resizeObserverLoopErr = 'ResizeObserver loop completed with undelivered notifications.';
window.addEventListener('error', (e) => {
    if (e.message === resizeObserverLoopErr) {
        e.stopImmediatePropagation();
    }
});
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes(resizeObserverLoopErr)) {
    return;
  }
  originalError(...args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

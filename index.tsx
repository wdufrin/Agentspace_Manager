
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress benign ResizeObserver errors usually caused by rapid layout changes in ReactFlow or containers
const resizeObserverErrRegex = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

window.addEventListener('error', (e) => {
    if (e.message && resizeObserverErrRegex.test(e.message)) {
        e.stopImmediatePropagation();
        e.preventDefault(); // Prevents the error from appearing in the console in some browsers
    }
});

const originalError = console.error;
console.error = (...args) => {
  if (args[0] && (typeof args[0] === 'string' && resizeObserverErrRegex.test(args[0]) || (args[0].message && resizeObserverErrRegex.test(args[0].message)))) {
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

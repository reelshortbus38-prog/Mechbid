import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { runStorageMigration } from './state/storageMigration.js';

// Before anything reads storage: carry data written under the old product name
// forward to the new keys. Runs once, copies rather than moves, and is a no-op
// on a browser that never saw the old name.
runStorageMigration();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

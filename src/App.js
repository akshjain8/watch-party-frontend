import React from 'react';
import '@/App.css';
import WatchParty from '@/components/WatchParty';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <div className="App">
      <WatchParty />
      <Toaster position="top-right" />
    </div>
  );
}

export default App;

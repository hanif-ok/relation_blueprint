import { useState } from 'react';
import styles from './App.module.css';
import { MapView } from '@/features/person-map/MapView';
import { UpdateToast } from '@/features/pwa/UpdateToast';
import { InstallPrompt } from '@/features/pwa/InstallPrompt';

/**
 * Walking-skeleton app shell — Task 1 wiring.
 *
 * Mounts the Konva MapView as the hero surface so an uploaded image becomes a map and
 * placed people render as round avatar markers. The top bar, + Person action, and the
 * profile sidebar are layered on in Task 2; this commit establishes the map surface and
 * the selection state the sidebar will consume.
 */
export function App() {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <span className={styles.wordmark}>Relation Blueprint</span>
      </header>
      <main className={styles.surface}>
        <MapView
          selectedPersonId={selectedPersonId}
          onSelect={(personId) => setSelectedPersonId(personId || null)}
        />
      </main>
      <UpdateToast />
      <InstallPrompt />
    </div>
  );
}

import styles from './App.module.css';
import { UpdateToast } from '@/features/pwa/UpdateToast';

/**
 * Walking-skeleton app shell.
 *
 * This is intentionally an empty paper-background shell with only a 56px top-bar
 * placeholder carrying the wordmark. The functional surfaces — Drive connect, the
 * Konva map Stage, the profile sidebar, person forms, export/restore — land in
 * later plans of this phase. The dark map canvas and amber accent are NOT introduced
 * here; only the warm paper chrome (#F4F1EA) the rest of the chrome sits on.
 */
export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <span className={styles.wordmark}>Relation Blueprint</span>
      </header>
      <main className={styles.surface} />
      <UpdateToast />
    </div>
  );
}

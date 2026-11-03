import { Link, Outlet } from 'react-router';

import './settings.css';

export function SettingsScreen() {
  return (
    <div className="settings-screen">
      <header>
        <h1>Settings</h1>
        <Link className="tap-secondary" to="/settings/credits">
          Credits
        </Link>
      </header>
      <Outlet />
    </div>
  );
}

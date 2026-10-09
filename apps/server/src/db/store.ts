import { openDatabase, type Db } from './database.js';
import { ListingRepo } from './listings.js';
import { MatchRepo } from './matches.js';
import { RunRepo } from './runs.js';
import { SettingsRepo } from './settings.js';
import { WatcherRepo } from './watchers.js';

export interface Store {
  db: Db;
  watchers: WatcherRepo;
  listings: ListingRepo;
  matches: MatchRepo;
  runs: RunRepo;
  settings: SettingsRepo;
}

export function createStore(file: string): Store {
  const db = openDatabase(file);
  return {
    db,
    watchers: new WatcherRepo(db),
    listings: new ListingRepo(db),
    matches: new MatchRepo(db),
    runs: new RunRepo(db),
    settings: new SettingsRepo(db),
  };
}

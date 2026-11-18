export interface FixtureAccount {
  uid: string;
  email: string;
  displayName: string;
  label: string;
  apps: string[];
}

export const FIXTURE_PASSWORD = 'local-fixture-password';

export const FIXTURE_USERS = {
  admin: {
    uid: 'seed-admin',
    email: 'nova@moondreams.dev',
    displayName: 'Nova Admin',
    label: 'Admin',
    apps: ['Admin'],
  },
  partnerOne: {
    uid: 'seed-worth-the-wait-one',
    email: 'alex@example.test',
    displayName: 'Alex Rivera',
    label: 'Alex',
    apps: ['Worth the Wait', 'Waypoint', 'A-List Tracker', 'Runway', 'Helm'],
  },
  partnerTwo: {
    uid: 'seed-worth-the-wait-two',
    email: 'jamie@example.test',
    displayName: 'Jamie Chen',
    label: 'Jamie',
    apps: ['Worth the Wait', 'Nine Lives', 'Runway', 'Helm'],
  },
  nineLivesCaretaker: {
    uid: 'seed-nine-lives-caretaker',
    email: 'taylor@example.test',
    displayName: 'Taylor Brooks',
    label: 'Taylor',
    apps: ['Nine Lives', 'Waypoint', 'Runway'],
  },
  goingOnceSeller: {
    uid: 'seed-going-once-seller',
    email: 'maya@example.test',
    displayName: 'Maya Okafor',
    label: 'Maya',
    apps: ['Going Once'],
  },
  goingOnceCoSeller: {
    uid: 'seed-going-once-coseller',
    email: 'theo@example.test',
    displayName: 'Theo Marsh',
    label: 'Theo',
    apps: ['Going Once'],
  },
  runwayScale: {
    uid: 'seed-runway-scale',
    email: 'morgan@example.test',
    displayName: 'Morgan Ellis',
    label: 'Morgan',
    apps: ['Runway', 'Helm'],
  },
} satisfies Record<string, FixtureAccount>;

// The account each app's own seed gives the most data; a scale seed is opt-in, so its account isn't one.
const DEFAULT_FIXTURE_BY_APP: Record<string, keyof typeof FIXTURE_USERS> = {
  'nine-lives': 'nineLivesCaretaker',
  'going-once': 'goingOnceSeller',
};

/** The fixture account a local run of an app opens signed in as. Emulators only. */
export const getDefaultFixture = (appId: string) =>
  FIXTURE_USERS[DEFAULT_FIXTURE_BY_APP[appId] ?? 'partnerOne'];

export const DEV_SIGN_IN_PARAM = 'devAs';

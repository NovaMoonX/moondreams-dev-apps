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
    apps: ['Worth the Wait', 'Waypoint'],
  },
  partnerTwo: {
    uid: 'seed-worth-the-wait-two',
    email: 'jamie@example.test',
    displayName: 'Jamie Chen',
    label: 'Jamie',
    apps: ['Worth the Wait', 'Nine Lives'],
  },
  nineLivesCaretaker: {
    uid: 'seed-nine-lives-caretaker',
    email: 'taylor@example.test',
    displayName: 'Taylor Brooks',
    label: 'Taylor',
    apps: ['Nine Lives'],
  },
} satisfies Record<string, FixtureAccount>;

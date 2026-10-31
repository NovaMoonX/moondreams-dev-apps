import assert from 'node:assert/strict';

import {
  buildFeedbackHandoffText,
  type HandoffItem,
} from '../../functions/src/feedback/startFeedbackClaudeSession.ts';

// A stored document carries the sender's identity; it must never reach the text.
const sender = { authorEmail: 'sender@example.com', authorName: 'Sam Sender' };

const item = (id: string, kind: string, text: string): HandoffItem => ({
  id,
  kind,
  status: 'looking',
  text,
  context: {
    appId: 'waypoint',
    path: '/waypoint/trips/t1?tab=days',
    siteVersion: '1.2.3',
    userAgent: 'Mozilla/5.0 (iPhone)',
    viewportWidth: 390,
    viewportHeight: 844,
  },
  ...sender,
});

const bug = item(
  'b1',
  'bug',
  'The "ticked" list resets <b>every</b> time.\nSecond line.',
);
const idea = item('i1', 'idea', 'Show all reminders in one place.');
const messages = {
  b1: [
    { kind: 'reply', isFromAdmin: true, text: 'Which phone?' },
    { kind: 'status', isFromAdmin: true, text: null },
    { kind: 'reply', isFromAdmin: false, text: 'An iPhone 15.' },
  ],
};

const single = buildFeedbackHandoffText([bug], messages, null);
assert.ok(single.startsWith('# A bug report'), 'single heading');
assert.ok(single.includes(bug.text), 'text verbatim');
assert.ok(
  single.includes(
    'https://apps.moondreams.dev/admin?view=feedback&feedback=b1',
  ),
  'admin link',
);
assert.ok(
  single.includes('Site version: 1.2.3') &&
    single.includes('Viewport: 390x844'),
  'context',
);
assert.ok(
  single.includes('/waypoint/trips/t1?tab=days') &&
    single.includes('Mozilla/5.0 (iPhone)'),
  'path and device',
);
assert.ok(
  single.indexOf('Admin: Which phone?') <
    single.indexOf('Sender: An iPhone 15.'),
  'replies in order',
);
assert.ok(!single.includes('Admin: null'), 'status changes are not replies');
assert.ok(
  !single.includes(sender.authorEmail) && !single.includes(sender.authorName),
  'no email or name',
);

const group = buildFeedbackHandoffText([bug, idea], messages, {
  name: 'Small fixes',
});
assert.ok(
  group.startsWith('# 2 pieces of feedback from the Small fixes group'),
  'group heading',
);
assert.ok(
  group.includes('feedback=i1') && group.includes(idea.text),
  'every item present',
);
assert.ok(
  !group.includes(sender.authorEmail) && !group.includes(sender.authorName),
  'no email or name in a group',
);

console.log('feedbackHandoff: ok');

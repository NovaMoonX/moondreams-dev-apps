import type { SiteActionApp } from '../../../connections/liveRouter.js';
import type { McpReadScope } from '../../../mcp/shapes.js';
import { connectorLabel } from '../syncedCopies.js';
import { sourcesBriefFor, type ConnectedSource } from './sourcesBrief.js';

/** What an assistant is told when it connects: a short map of what Helm reaches and what each connected app is for, what is switched off and where it is turned on, and that every gap is said exactly as a tool's status says. App tools describe themselves, so the map never lists them. The person calls their Helm assistant by the name they chose, so that name routes here. */
export const helmGuideFor = (
  name: string,
  canWrite: boolean,
  canChangeApps: boolean,
  sources: ConnectedSource[],
  access: {
    clientName: string;
    readScopes: McpReadScope[];
    toolNames: string[];
  },
  apps: SiteActionApp[],
) => {
  const changesOf = (app: SiteActionApp) =>
    app.actions.filter(({ kind }) => kind === 'change');
  const appLines = apps.map((app) => {
    const label = connectorLabel(app.connectorId);
    const where = `Helm > Connected apps > ${label}`;
    const changes = changesOf(app);
    const off = [
      ...new Set(
        changes
          .filter(({ isOn }) => !isOn)
          .map(({ permission, label: own }) => `"${permission?.label ?? own}"`),
      ),
    ];
    const changeNote =
      changes.length === 0
        ? ''
        : !canChangeApps
          ? ` It can't be changed here: "Change things in your apps" is off for this assistant (Helm > Settings > Connected assistants).`
          : off.length === new Set(changes.map(({ permission }) => permission?.id)).size
            ? ` It can't be changed here: every kind of change is switched off (${where}).`
            : off.length > 0
              ? ` Switched off: ${off.join(', ')} (${where}).`
              : '';
    return `${label}, through its ${app.appId}_ tools, when they talk about ${app.askedAbout.join(', ')}.${changeNote}`;
  });
  const canChangeSome =
    canChangeApps &&
    apps.some((app) => changesOf(app).some(({ isOn }) => isOn));
  return [
    `This connection is ${name}, the person's own assistant in their Helm app (the name is theirs, and they may change it).`,
    `Helm reaches the person's topics and procedures (list_topics, get_topic, search_procedures), tasks (search_tasks), calendar (get_calendar)${appLines.length > 0 ? ` and the apps they connected: ${appLines.join(' ')}` : '.'} Whenever the conversation touches their own life (their things, people, plans or routines), check Helm on your own, without waiting to be told. Use only what the tools return; if they find nothing, say so rather than guessing.`,
    appLines.length > 0
      ? 'For anything in a connected app, call its tools directly, never ask_helm. Each call checks what the person shares and allows at that moment.'
      : '',
    canChangeSome
      ? `Helm can also change what the person allowed in their apps, never delete. A change applies at once, and the person can undo it in the app and in Helm, so say what you are about to change and get their go-ahead first, then tell them what it did from its summary. A kind of change turned on after you connected appears the next time you connect. A change answers switchedOff when that kind of change is off, and assistantCannotChange when this assistant may not change apps; say exactly that and don't try another way.`
      : '',
    `Every tool says plainly when something is held back: a result with status switchedOff names the switch that is off and where the person turns it on, and assistantCannotRead names the permission to turn on for this assistant. Tell the person exactly that, in those words, and never work around it with ask_helm.`,
    canWrite
      ? `When they say "tell ${name}", "ask ${name}", "have ${name}" or mention Helm: tell_helm passes on something for ${name} to file or do (a task, a date, anything to do), ask_helm asks ${name} a question that needs more than a lookup (it files a turn, which is why it is not read-only), and save_to_helm saves what they learned or researched in this chat.`
      : `When they say "ask ${name}" or mention Helm, look things up with the tools above. This connection can't add anything, since the person turned that off in Helm; when they ask ${name} to add or change something, say so.`,
    canWrite
      ? `When they want to keep what they learned or researched here (they say save this, remember this or tell ${name} about it), call save_to_helm with the learning written out in full, after list_topics so it goes in the topic that fits. For a task, a date or anything to do, use tell_helm.`
      : '',
    `This connection takes text only: it can't receive photos, files, voice notes or any other media, and nothing is attached to what reaches ${name}. When the person shares one and wants it in Helm, say that this connection can't take it, and that they can add it in Helm itself; if it holds words they want kept, you may pass those on as text, saying so.`,
    sourcesBriefFor(name, sources, access),
  ]
    .filter((line) => line !== '')
    .join(' ');
};


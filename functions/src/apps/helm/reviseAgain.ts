import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { HelmKey } from './helmKey.js';
import { releaseTopicWrite, reserveTopicWrite } from './aiLimits.js';
import type { ReviseTopicCommand, TopicCommand } from './nomos/commands.js';
import { askTopicModel, pickTopicProvider } from './topicModel.js';
import { openLiveTopic } from './topicVersionStore.js';
import {
  buildReviseMessage,
  editablePersonSections,
  readChanges,
  REVISE_PROMPT,
  SUBMIT_REVISE_TOOL,
} from './topicWrite.js';

const settle = async (
  firestore: Firestore,
  input: {
    uid: string;
    base: string;
    key: HelmKey;
    apiKey: string;
    captureText: string;
    now: number;
  },
  command: ReviseTopicCommand,
): Promise<ReviseTopicCommand> => {
  const data = (
    await firestore.doc(`${input.base}/topics/${command.topicId}`).get()
  ).data();
  const topic = data ? openLiveTopic(input.key, command.topicId, data) : null;
  if (!topic || topic.version === command.seenVersion) return command;
  const provider = pickTopicProvider(input.apiKey);
  if (!provider) return command;
  if (!(await reserveTopicWrite(firestore, input.uid, input.now))) {
    return command;
  }
  const reply = await askTopicModel(firestore, provider, 'topicWrite', {
    system: REVISE_PROMPT,
    message: buildReviseMessage({
      name: topic.name,
      sections: topic.sections,
      quote: command.requestQuote,
      editableIds: [
        ...editablePersonSections(input.captureText, topic.sections),
      ],
    }),
    terminalTool: SUBMIT_REVISE_TOOL,
  }).catch(() => null);
  const read = readChanges(reply);
  if (!read || read.changes.length === 0) {
    await releaseTopicWrite(firestore, input.uid, input.now).catch(() =>
      logger.error('helm.topic.releaseWriteFailed'),
    );
    return command;
  }
  logger.info('helm.topic.reviseRetried', { changes: read.changes.length });
  return {
    ...command,
    changes: read.changes,
    changeSummary: read.summary || command.changeSummary,
    seenVersion: topic.version,
  };
};

/** A revision the topic moved on from since the model read it is asked for again, once, from the document as it is now; any failure leaves it as it was, for the write to refuse. */
export const refreshRevisions = (
  firestore: Firestore,
  input: Parameters<typeof settle>[1],
  commands: TopicCommand[],
): Promise<TopicCommand[]> =>
  Promise.all(
    commands.map((command) =>
      command.kind === 'reviseTopic'
        ? settle(firestore, input, command).catch((): ReviseTopicCommand => {
            logger.warn('helm.topic.reviseRetryFailed');
            return command;
          })
        : Promise.resolve(command),
    ),
  );

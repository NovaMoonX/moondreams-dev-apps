import { groupSteps, type StepGroupBlock } from '@apps/helm/utils/stepGroups';
import type { OpenProcedure } from '@apps/helm/types';

const escape = (text: string) =>
  text.replace(/[\\*_[\]#]/g, '\\$&').replace(/^-/, '\\-');

const lineOf = (text: string) => escape(text.replace(/\s+/g, ' ').trim());

const stepLines = (block: StepGroupBlock) =>
  block.steps.flatMap((step) => [
    `- [ ] ${lineOf(step.text)}`,
    ...(step.detail
      ? step.detail
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => `  ${escape(line.trim())}`)
      : []),
  ]);

/** The procedure as a Markdown checklist: its title, the ungrouped steps, then each group under its name. */
export const toProcedureMarkdown = (
  procedure: Pick<
    OpenProcedure,
    'title' | 'stepState' | 'groupOrder' | 'steps' | 'groups'
  >,
) =>
  [
    `# ${lineOf(procedure.title)}`,
    ...groupSteps(procedure).flatMap((block) => [
      '',
      ...(block.name === null ? [] : [`## ${lineOf(block.name)}`]),
      ...stepLines(block),
    ]),
  ].join('\n');

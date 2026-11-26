import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import { useAppDispatch, type RootState } from '@/store';
import { recordTurn, type TurnLogValue } from '@/lib/speech/turnLog';
import { generateUuid } from '@/utils';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import type { PepperAction } from '@apps/pinch/hooks/usePepper';
import type {
  CookActionCommand,
  CookVoiceResult,
} from '@apps/pinch/hooks/useCookVoice';
import type { CookCapture } from '@apps/pinch/hooks/useCookCapture';
import { addNote, updateNote } from '@apps/pinch/store/actions/noteActions';
import {
  addToShoppingList,
  removeShoppingItem,
} from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredients,
  selectShoppingItems,
  selectShoppingLoadError,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { matchIngredient } from '@apps/pinch/utils/ingredientMatch';
import {
  askToRemoveEntry,
  createRemovalWait,
  getEntryWord,
  readConfirmAnswer,
  readPepperAction,
  type PepperCommand,
  type PepperCookCommand,
} from '@apps/pinch/utils/pepperActions';
import {
  getNameOnlyItemId,
  type SourcedLine,
} from '@apps/pinch/utils/shopping';

/** What cooking mode lends Pepper: the screen's own actions and the facts that limit them. */
export interface PepperScreen {
  uid: string;
  /** The same executor a spoken command runs through. */
  runCook: (command: CookActionCommand) => CookVoiceResult;
  goToStep: (step: number) => CookVoiceResult;
  /** The lines a tick would newly change on the gather screen, so an undo touches only those. */
  getTickChanges: (
    queries: string[],
    isOut: boolean,
  ) => { recipeId: string; lineId: string }[];
  setTicks: (
    lines: { recipeId: string; lineId: string }[],
    isOut: boolean,
  ) => void;
  /** The lines a spoken added-tick would newly change on the step shown, with that dish and step, or null when no step is shown. */
  getAddedChanges: (
    queries: string[],
    isAdded: boolean,
  ) => { recipeId: string; step: number; lineIds: string[] } | null;
  setAdded: (
    change: { recipeId: string; step: number; lineIds: string[] },
    isAdded: boolean,
  ) => void;
  /** Speaks a line after the fact, for a write that failed once the answer was given. */
  say: (text: string) => void;
  capture: Pick<CookCapture, 'quickAdd' | 'removeById'>;
  shown: { recipeId: string; servings: number; stepCount: number };
  /** The recipes in this session; an entry outside them is not Pepper's to touch. */
  recipeIds: string[];
  /** Why a tip, note or change can't be written from here right now, or null. */
  entryBlock: string | null;
  /** A tip, note or change is open in the composer. */
  isWriting: boolean;
  /** A plate on the gather screen, where servings are set per dish. */
  isDishAmbiguous: boolean;
}

export interface PepperRun {
  said?: string;
  /** The screen refused it, for the conversation log. */
  isRefused?: boolean;
  /** The conversation is over once the reply has been said. */
  isEnding?: boolean;
}

interface UndoEntry {
  key: string;
  /** Takes the change back and says so; null for what can't be taken back. */
  undo: (() => string) | null;
  /** What `undo` couldn't take back, in words that follow "I can't take back". */
  cannot: string;
}

const MAX_UNDO = 10;
const NO_ENTRY = "I can't find that one.";

const toSaid = (result: CookVoiceResult): PepperRun =>
  result.ok ? {} : { said: result.spoken ?? result.reason, isRefused: true };

const toUndoSaid = (result: CookVoiceResult, done: string) =>
  result.ok ? done : (result.spoken ?? result.reason);

const isWritten = (note: RecipeNote | undefined, recipeIds: string[]) =>
  note !== undefined &&
  note.kind !== 'TWEAK' &&
  recipeIds.includes(note.recipeId);

/** Runs each action Pepper asks for through cooking mode's own actions, as a tap or a voice command would, with an undo stack and a question before a removal. */
export function usePepperActions(screen: PepperScreen) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const latest = useRef(screen);
  const undoStack = useRef<UndoEntry[]>([]);
  const [removal] = useState(createRemovalWait);
  useEffect(() => {
    latest.current = screen;
  });

  const fire = useCallback(
    (task: Promise<unknown>, problem: string, onFail?: () => void) => {
      task.catch(() => {
        onFail?.();
        latest.current.say(problem);
      });
    },
    [],
  );

  const push = useCallback((entry: Omit<UndoEntry, 'key'>) => {
    undoStack.current = [
      ...undoStack.current.slice(-(MAX_UNDO - 1)),
      { ...entry, key: generateUuid() },
    ];
  }, []);

  const getNote = useCallback(
    (id: string) => {
      const note = store
        .getState()
        .pinch.notes.items.find((candidate) => candidate.id === id);
      return isWritten(note, latest.current.recipeIds) ? note : undefined;
    },
    [store],
  );

  const runCook = useCallback(
    (command: PepperCookCommand): PepperRun => {
      const screenNow = latest.current;
      if (command.kind === 'SET_SERVINGS') {
        if (screenNow.isDishAmbiguous) {
          return { said: "Set each dish's servings with its stepper." };
        }
        const { recipeId, servings: before } = screenNow.shown;
        const result = screenNow.runCook({ ...command, recipeId });
        if (result.ok) {
          push({
            cannot: 'the servings',
            undo: () =>
              toUndoSaid(
                latest.current.runCook({
                  kind: 'SET_SERVINGS',
                  change: { kind: 'TO', servings: before },
                  recipeId,
                }),
                `Put the servings back to ${before}.`,
              ),
          });
        }
        return toSaid(result);
      }
      const ticked =
        command.kind === 'GOT_INGREDIENT'
          ? screenNow.getTickChanges(command.queries, command.isOut)
          : [];
      const addedChange =
        command.kind === 'MARK_ADDED'
          ? screenNow.getAddedChanges(command.queries, command.isAdded)
          : null;
      const result = screenNow.runCook(command);
      if (!result.ok) return toSaid(result);
      if (command.kind === 'MARK_ADDED') {
        if (addedChange !== null && addedChange.lineIds.length > 0) {
          push({
            cannot: 'that',
            undo: () => {
              latest.current.setAdded(addedChange, !command.isAdded);
              return 'Took that back.';
            },
          });
        }
        return {};
      }
      if (command.kind === 'GOT_INGREDIENT') {
        if (ticked.length > 0) {
          push({
            cannot: 'that',
            undo: () => {
              latest.current.setTicks(ticked, !command.isOut);
              return 'Took that back.';
            },
          });
        }
        return {};
      }
      const inverse = getInverse(command);
      if (inverse !== null) {
        push({
          cannot: 'that',
          undo: () =>
            toUndoSaid(latest.current.runCook(inverse), 'Took that back.'),
        });
      } else if (isChange(command)) {
        push({ cannot: getChangeLabel(command), undo: null });
      }
      return {};
    },
    [push],
  );

  const addEntry = useCallback(
    (command: Extract<PepperCommand, { kind: 'add_entry' }>): PepperRun => {
      const screenNow = latest.current;
      if (screenNow.entryBlock !== null) return { said: screenNow.entryBlock };
      const { stepCount, recipeId } = screenNow.shown;
      if (command.step !== null && command.step > stepCount) {
        return { said: `This recipe has ${stepCount} steps.` };
      }
      const id = generateUuid();
      const word = getEntryWord(command.entryKind);
      fire(
        screenNow.capture.quickAdd({
          id,
          recipeId,
          kind: command.entryKind,
          text: command.text,
          stepIndex: command.step === null ? null : command.step - 1,
        }),
        `Sorry, I couldn't save that ${word}.`,
        () => {
          undoStack.current = undoStack.current.filter(
            (entry) => entry.key !== id,
          );
        },
      );
      undoStack.current = [
        ...undoStack.current.slice(-(MAX_UNDO - 1)),
        {
          key: id,
          cannot: `the ${word}`,
          undo: () => {
            fire(
              latest.current.capture.removeById(id),
              `Sorry, I couldn't take that ${word} back.`,
            );
            return `Took that ${word} back.`;
          },
        },
      ];
      return {};
    },
    [fire],
  );

  const editEntry = useCallback(
    (command: Extract<PepperCommand, { kind: 'edit_entry' }>): PepperRun => {
      const { uid, isWriting } = latest.current;
      if (isWriting) return { said: 'Finish writing this one first.' };
      const note = getNote(command.id);
      if (note === undefined) return { said: NO_ENTRY };
      const word = getEntryWord(note.kind as 'TIP' | 'NOTE' | 'CHANGE');
      const before = note.text ?? '';
      fire(
        dispatch(updateNote({ uid, id: note.id, text: command.text })).unwrap(),
        `Sorry, I couldn't change that ${word}.`,
      );
      push({
        cannot: `the change to the ${word}`,
        undo: () => {
          fire(
            dispatch(updateNote({ uid, id: note.id, text: before })).unwrap(),
            `Sorry, I couldn't put that ${word} back.`,
          );
          return `Put the ${word} back as it was.`;
        },
      });
      return {};
    },
    [dispatch, fire, getNote, push],
  );

  const askRemoval = useCallback(
    (id: string): PepperRun => {
      if (latest.current.isWriting) {
        return { said: 'Finish writing this one first.' };
      }
      const note = getNote(id);
      if (note === undefined) return { said: NO_ENTRY };
      removal.ask(id, Date.now());
      return {
        said: askToRemoveEntry(
          note.kind as 'TIP' | 'NOTE' | 'CHANGE',
          note.text ?? '',
        ),
      };
    },
    [getNote, removal],
  );

  const addToShopping = useCallback(
    (
      command: Extract<PepperCommand, { kind: 'add_to_shopping_list' }>,
    ): PepperRun => {
      const state = store.getState();
      if (!state.pinch.shopping.isLoaded || selectShoppingLoadError(state)) {
        return { said: "Your shopping list isn't ready yet." };
      }
      const ingredients = selectIngredients(state);
      const found = command.items.map((item) => ({
        item,
        ingredient: matchIngredient(item.name, ingredients),
      }));
      const missed = found.flatMap(({ item, ingredient }) =>
        ingredient === null ? [item.name] : [],
      );
      const lines = found.flatMap(({ item, ingredient }): SourcedLine[] =>
        ingredient === null
          ? []
          : [
              {
                ingredientId: ingredient.id,
                amount: null,
                unit: 'EACH',
                amountText: item.amount,
                source: null,
              },
            ],
      );
      const missedSaid = `I couldn't find ${new Intl.ListFormat('en-US').format(missed)} in your ingredients, so ${missed.length === 1 ? "that wasn't" : "those weren't"} added.`;
      if (lines.length === 0) return { said: missedSaid };

      const { uid } = latest.current;
      const onList = new Set(selectShoppingItems(state).map((item) => item.id));
      const ids = [
        ...new Set(lines.map((line) => getNameOnlyItemId(line.ingredientId))),
      ];
      const created = ids.filter((id) => !onList.has(id));
      fire(
        dispatch(addToShoppingList({ uid, lines })).unwrap(),
        "Sorry, I couldn't add that to your shopping list.",
      );
      push({
        cannot: 'what you added, since it was already on your list',
        undo:
          created.length === 0
            ? null
            : () => {
                fire(
                  dispatch(removeShoppingItem({ uid, ids: created })).unwrap(),
                  "Sorry, I couldn't take that off your list.",
                );
                return created.length < ids.length
                  ? 'Took what I added off your list. The rest were already on it, so they stay.'
                  : 'Took that off your list.';
              },
      });
      return missed.length === 0 ? {} : { said: missedSaid };
    },
    [dispatch, fire, push, store],
  );

  const undo = useCallback((): PepperRun => {
    const entry = undoStack.current.at(-1);
    if (entry === undefined) return { said: 'There is nothing to undo.' };
    undoStack.current = undoStack.current.slice(0, -1);
    return {
      said:
        entry.undo === null
          ? `I can't take back ${entry.cannot}.`
          : entry.undo(),
    };
  }, []);

  const execute = useCallback(
    (command: PepperCommand): PepperRun => {
      removal.clear();
      switch (command.kind) {
        case 'cook':
          return runCook(command.command);
        case 'go_to_step':
          return toSaid(latest.current.goToStep(command.step));
        case 'add_entry':
          return addEntry(command);
        case 'edit_entry':
          return editEntry(command);
        case 'remove_entry':
          return askRemoval(command.id);
        case 'add_to_shopping_list':
          return addToShopping(command);
        case 'undo_last':
          return undo();
        case 'end_conversation':
          return { isEnding: true };
        case 'finish':
          return {
            said: "Finishing is your own tap on Finish when you're done.",
          };
        case 'invalid':
          return { said: command.said };
        case 'unknown':
          return { said: "I can't do that on the screen." };
      }
    },
    [addEntry, addToShopping, askRemoval, editEntry, removal, runCook, undo],
  );

  const run = useCallback(
    (action: Pick<PepperAction, 'name' | 'input'>): PepperRun => {
      const command = readPepperAction(action);
      const result: PepperRun =
        hasDialogOnTop() && command.kind !== 'end_conversation'
          ? {
              said: 'Close what is open first, then ask me again.',
              isRefused: true,
            }
          : execute(command);
      const isRefused =
        result.isRefused === true ||
        command.kind === 'invalid' ||
        command.kind === 'unknown' ||
        command.kind === 'finish';
      recordTurn(
        'action',
        `${action.name}${command.kind === 'cook' ? ` (${command.command.kind})` : ''}`,
        {
          input: toLoggedInput(action.input),
          outcome: isRefused
            ? 'refused'
            : result.isEnding === true
              ? 'conversation ends after the reply'
              : result.said === undefined
                ? 'done on screen'
                : 'said something',
          said: result.said ?? null,
          undoSteps: undoStack.current.length,
          isConfirmWaiting: removal.isWaiting(Date.now()),
        },
      );
      return result;
    },
    [execute, removal],
  );

  const hasPending = useCallback(
    () => removal.isWaiting(Date.now()),
    [removal],
  );

  const clearPending = useCallback(() => removal.clear(), [removal]);

  const confirm = useCallback((): PepperRun => {
    const id = removal.take(Date.now());
    if (id === null) return { said: "There's nothing waiting on a yes." };
    const note = getNote(id);
    if (note === undefined) return { said: 'That one is already gone.' };
    const { uid, capture } = latest.current;
    const word = getEntryWord(note.kind as 'TIP' | 'NOTE' | 'CHANGE');
    fire(capture.removeById(note.id), `Sorry, I couldn't remove that ${word}.`);
    push({
      cannot: `removing the ${word}`,
      undo: () => {
        fire(
          dispatch(
            addNote({
              uid,
              id: note.id,
              recipeId: note.recipeId,
              kind: note.kind as 'TIP' | 'NOTE' | 'CHANGE',
              text: note.text ?? '',
              reason: note.reason,
              cookId: note.cookId,
              stepIndex: note.stepIndex,
            }),
          ).unwrap(),
          `Sorry, I couldn't put that ${word} back.`,
        );
        return `Put the ${word} back.`;
      },
    });
    return { said: `Removed the ${word}.` };
  }, [dispatch, fire, getNote, push, removal]);

  const decline = useCallback((): PepperRun => {
    const id = removal.take(Date.now());
    return id === null ? {} : { said: "Okay, I'll keep it." };
  }, [removal]);

  /** Settles a waiting removal from what was heard; null when nothing waits or the words were neither yes nor no. */
  const answerPending = useCallback(
    (heard: string): PepperRun | null => {
      if (!hasPending()) return null;
      const answer = readConfirmAnswer(heard);
      if (answer === null) return null;
      return answer === 'yes' ? confirm() : decline();
    },
    [confirm, decline, hasPending],
  );

  return { run, hasPending, clearPending, confirm, decline, answerPending };
}

const toLoggedInput = (input: unknown): TurnLogValue => {
  try {
    return (JSON.parse(JSON.stringify(input ?? null)) ?? null) as TurnLogValue;
  } catch {
    return String(input);
  }
};

const getInverse = (command: PepperCookCommand): CookActionCommand | null => {
  if (command.kind === 'PAUSE_TIMER') {
    return { kind: 'RESUME_TIMER', target: command.target };
  }
  if (command.kind === 'RESUME_TIMER') {
    return { kind: 'PAUSE_TIMER', target: command.target };
  }
  return null;
};

const isChange = (command: PepperCookCommand) =>
  command.kind === 'START_TIMER' ||
  command.kind === 'STOP_TIMER' ||
  command.kind === 'EXTEND_TIMER';

const getChangeLabel = (command: PepperCookCommand) => {
  if (command.kind === 'START_TIMER') return 'starting a timer';
  if (command.kind === 'STOP_TIMER') return 'stopping a timer';
  return 'adding time to a timer';
};

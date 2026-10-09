import { useState } from 'react';

import { Checkbox } from '@moondreamsdev/dreamer-ui/components';

export interface LinkedItem {
  id: string;
  title: string;
}

interface DeleteEventChoicesProps {
  eventTitle: string;
  todos: LinkedItem[];
  expenses: LinkedItem[];
  /** Linked expenses that can't go with the event (early payments recorded against them). */
  blockedExpenseCount: number;
  onChange: (choice: { todos: boolean; expenses: boolean }) => void;
}

const MAX_TITLES = 3;

function describe(items: LinkedItem[]) {
  const shown = items.slice(0, MAX_TITLES).map((item) => item.title);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
}

function Choice({ checked, onCheckedChange, label, detail }: { checked: boolean; onCheckedChange: (value: boolean) => void; label: string; detail: string }) {
  return (
    <label className='flex cursor-pointer items-start gap-3'>
      <span className='mt-0.5 inline-flex w-5 shrink-0 justify-center'>
        <Checkbox checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      </span>
      <span className='min-w-0'>
        <span className='block font-medium'>{label}</span>
        <span className='text-muted-foreground block break-words'>{detail}</span>
      </span>
    </label>
  );
}

/** The body of the delete confirm: what hangs off the event, and whether to take it along. Nothing is checked by default. */
function DeleteEventChoices({ eventTitle, todos, expenses, blockedExpenseCount, onChange }: DeleteEventChoicesProps) {
  const [choice, setChoice] = useState({ todos: false, expenses: false });
  const update = (next: Partial<typeof choice>) => {
    const merged = { ...choice, ...next };
    setChoice(merged);
    onChange(merged);
  };

  return (
    <div className='space-y-3 text-sm'>
      <p>Delete &quot;{eventTitle}&quot;? This action cannot be undone.</p>
      {todos.length > 0 && (
        <Choice
          checked={choice.todos}
          onCheckedChange={(todosChecked) => update({ todos: todosChecked })}
          label={`Also delete its ${todos.length === 1 ? 'to-do' : `${todos.length} to-dos`}`}
          detail={describe(todos)}
        />
      )}
      {expenses.length > 0 && (
        <Choice
          checked={choice.expenses}
          onCheckedChange={(expensesChecked) => update({ expenses: expensesChecked })}
          label={`Also delete its ${expenses.length === 1 ? 'expense' : `${expenses.length} expenses`}`}
          detail={describe(expenses)}
        />
      )}
      {blockedExpenseCount > 0 && (
        <p className='text-muted-foreground'>
          {blockedExpenseCount === 1 ? 'An expense has' : `${blockedExpenseCount} expenses have`} early payments, so{' '}
          {blockedExpenseCount === 1 ? 'it stays' : 'they stay'} on the Expenses list.
          {todos.length + expenses.length > 0 && ' Whatever you leave unchecked stays too.'}
        </p>
      )}
      {todos.length + expenses.length > 0 && blockedExpenseCount === 0 && (
        <p className='text-muted-foreground'>Whatever you leave unchecked stays on your lists, no longer linked to the event.</p>
      )}
    </div>
  );
}

export default DeleteEventChoices;

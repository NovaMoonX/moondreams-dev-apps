import type { KeyboardEvent } from 'react';

/** Put on a container: Enter in one of its text inputs no longer submits the form around it (a textarea still takes a new line, a button still activates). */
export const blockEnterSubmit = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    event.preventDefault();
  }
};

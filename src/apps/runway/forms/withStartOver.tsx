import { useState, type ComponentType } from 'react';

export interface StartOverProps {
  /** Opens the form again as it does normally, once the kept draft is gone. */
  onStartOver: () => void;
}

/** Remounts a form on Start over, so its question flow and every piece of state begin as they do on a normal open. */
export function withStartOver<P extends object>(
  Body: ComponentType<P & StartOverProps>,
) {
  function WithStartOver(props: P) {
    const [round, setRound] = useState(0);
    return (
      <Body
        key={round}
        {...props}
        onStartOver={() => setRound((current) => current + 1)}
      />
    );
  }
  return WithStartOver;
}

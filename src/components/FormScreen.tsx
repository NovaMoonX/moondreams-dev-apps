import type { ReactNode } from 'react';

import { Modal } from '@moondreamsdev/dreamer-ui/components';

import Subview from '@/components/Subview';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface FormScreenProps {
  isOpen: boolean;
  onClose: () => void;
  /** A plain noun, the same for creating and editing. */
  title: string;
  children: ReactNode;
}

/**
 * Where a form that is too long for a phone's modal lives: a full-screen subview on phones (with its
 * footer pinned to the bottom, so the form can be as long as it needs to be) and a modal from `sm` up,
 * where there is room. Forms that fit a phone screen without scrolling stay a plain `Modal`.
 */
function FormScreen({ isOpen, onClose, title, children }: FormScreenProps) {
  const isPhone = useMediaQuery().isBelow('sm');

  if (!isOpen) {
    return null;
  }

  if (isPhone) {
    return (
      <Subview overlay title={title} onClose={onClose}>
        {children}
      </Subview>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      {children}
    </Modal>
  );
}

export default FormScreen;

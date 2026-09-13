import { Modal } from '@moondreamsdev/dreamer-ui/components';
import type { ReactNode } from 'react';

interface AppSetupModalProps {
  isOpen: boolean;
  title: string;
  onClose?: () => void;
  hideCloseButton?: boolean;
  children: ReactNode;
}

function AppSetupModal({
  isOpen,
  title,
  onClose,
  hideCloseButton = false,
  children,
}: AppSetupModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title={title}
      hideCloseButton={hideCloseButton}
    >
      {children}
    </Modal>
  );
}

export default AppSetupModal;

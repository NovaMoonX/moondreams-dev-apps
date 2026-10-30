import { useLayoutEffect, useRef, useState } from 'react';
import { Download, ReceiptText, Trash2 } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FallbackImage from '@/components/FallbackImage';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { getErrorMessage } from '@/utils/errorUtils';
import { SPEND_WORDS } from '@apps/runway/constants';
import {
  forgetReceiptImage,
  useReceiptImageUrl,
} from '@apps/runway/hooks/useReceiptImageUrl';
import { removeReceiptImage } from '@apps/runway/store/actions/receiptActions';
import type { OpenReceiptImage } from '@apps/runway/types';
import { findScrollParent } from '@apps/runway/utils/receiptFiles';

interface ReceiptViewerProps {
  image: OpenReceiptImage;
  onBack: () => void;
}

/** One receipt, opened on this device: the picture fitted to the width, a download, and the way to remove it. While amounts are hidden it is a neutral tile that shows them. */
function ReceiptViewer({ image, onBack }: ReceiptViewerProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { isHidden, toggle } = useValuesHidden();
  const { url, isFailed } = useReceiptImageUrl(image, !isHidden);
  const root = useRef<HTMLDivElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const scroller = findScrollParent(root.current);
    if (scroller) scroller.scrollTop = 0;
  }, []);

  const download = () => {
    if (url === null) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = image.fileName ?? SPEND_WORDS.receiptDownloadName;
    link.click();
  };

  const remove = async () => {
    if (!user || isBusy) return;
    const isConfirmed = await confirm({
      title: SPEND_WORDS.removeReceiptTitle,
      message: SPEND_WORDS.removeReceiptMessage,
      confirmText: SPEND_WORDS.removeReceipt,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      await removeReceiptImage(user.uid, image);
      forgetReceiptImage(image.id);
      addToast({ title: SPEND_WORDS.receiptRemoved, type: 'success' });
      onBack();
    } catch (removeError) {
      setError(getErrorMessage(removeError, SPEND_WORDS.receiptRemoveFailed));
      setIsBusy(false);
    }
  };

  return (
    <div ref={root} className='space-y-4'>
      <BackLink onBack={onBack} />
      <div data-sensitive=''>
        {isHidden ? (
          <Button
            type='button'
            variant='tertiary'
            className='bg-muted text-muted-foreground h-auto min-h-48 w-full flex-col gap-2 rounded-2xl whitespace-normal'
            onClick={toggle}
          >
            <ReceiptText className='size-8' aria-hidden='true' />
            <span className='text-sm'>{SPEND_WORDS.receiptHidden}</span>
          </Button>
        ) : url === null ? (
          <p className='text-muted-foreground text-sm'>
            {isFailed
              ? SPEND_WORDS.receiptOpenFailed
              : SPEND_WORDS.receiptOpening}
          </p>
        ) : (
          <FallbackImage
            src={url}
            alt={SPEND_WORDS.receipt}
            fallback={
              <p className='text-muted-foreground text-sm'>
                {SPEND_WORDS.receiptOpenFailed}
              </p>
            }
            className='border-border mx-auto h-auto max-h-[60vh] w-auto max-w-full rounded-2xl border object-contain'
          />
        )}
      </div>
      {!isHidden && (
        <ActionGroup isRoomy>
          <ActionRow
            isGrouped
            isRoomy
            icon={<Download />}
            label={SPEND_WORDS.downloadReceipt}
            isDisabled={url === null}
            onClick={download}
          />
        </ActionGroup>
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      <ActionRow
        isRoomy
        isDestructive
        icon={<Trash2 />}
        label={SPEND_WORDS.removeReceipt}
        isDisabled={isBusy}
        onClick={() => void remove()}
      />
    </div>
  );
}

export default ReceiptViewer;

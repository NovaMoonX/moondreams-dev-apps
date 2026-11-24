import { ArrowDownToLine, PiggyBank, TriangleAlert } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { formatCents } from '@/utils/moneyUtils';
import { COVER_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';

/** How a pick the envelope can't cover is settled: what's left plus Free to Spend, a move in first, or over. */
export type CoverChoice = 'useRest' | 'moveIn' | 'goOver';

interface CoverShortfallSheetProps {
  name: string;
  /** What the envelope has left before this; at or below zero there is nothing of it to use. */
  leftCents: number;
  shortCents: number;
  /** Several purchases sent together. */
  isMany?: boolean;
  /** Already sent there by a rule, so the sheet says it went over rather than that it would. */
  isPlaced?: boolean;
  isBusy: boolean;
  error: string | null;
  onChoose: (choice: CoverChoice) => void;
  onClose: () => void;
}

/** Asked before a pick takes an envelope below zero; nothing is chosen for the person. */
function CoverShortfallSheet({
  name,
  leftCents,
  shortCents,
  isMany = false,
  isPlaced = false,
  isBusy,
  error,
  onChoose,
  onClose,
}: CoverShortfallSheetProps) {
  const mask = useMaskedText();
  const usable = Math.max(0, leftCents);
  const left = formatCents(usable);
  const short = formatCents(shortCents);
  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={COVER_WORDS.title(name)}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-3 pb-4'>
        <p className='text-muted-foreground text-sm'>
          {mask(
            isPlaced
              ? COVER_WORDS.bodyPlaced(name, short)
              : (isMany ? COVER_WORDS.bodyMany : COVER_WORDS.body)(
                  name,
                  left,
                  short,
                ),
          )}
        </p>
        <ActionGroup isRoomy>
          <ActionRow
            isGrouped
            isRoomy
            icon={<PiggyBank />}
            label={mask(
              isPlaced
                ? COVER_WORDS.placedFree(short)
                : usable > 0
                  ? COVER_WORDS.spendRest(left, name)
                  : COVER_WORDS.allFree,
            )}
            subtitle={mask(
              isPlaced
                ? COVER_WORDS.placedFreeSub(name, short)
                : usable > 0
                  ? COVER_WORDS.spendRestSub(short)
                  : COVER_WORDS.allFreeSub(name),
            )}
            isDisabled={isBusy}
            onClick={() => onChoose('useRest')}
          />
          <ActionRow
            isGrouped
            isRoomy
            icon={<ArrowDownToLine />}
            label={mask(COVER_WORDS.moveIn(short, name))}
            subtitle={COVER_WORDS.moveInSub}
            isDisabled={isBusy}
            onClick={() => onChoose('moveIn')}
          />
        </ActionGroup>
        <ActionRow
          icon={<TriangleAlert />}
          label={mask(
            (isPlaced ? COVER_WORDS.keepOver : COVER_WORDS.goOver)(name, short),
          )}
          subtitle={COVER_WORDS.goOverSub}
          isDisabled={isBusy}
          onClick={() => onChoose('goOver')}
        />
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
      </div>
    </FormSheet>
  );
}

export default CoverShortfallSheet;

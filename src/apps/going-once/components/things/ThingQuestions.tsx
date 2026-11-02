import { Input } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import AppToggle from '@/components/AppToggle';
import DateInput from '@/components/DateInput';
import Field from '@/components/forms/Field';
import LinkAttachField from '@/components/forms/LinkAttachField';
import MoneyInput from '@/components/MoneyInput';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { parseMoneyToCents } from '@/utils/moneyUtils';
import {
  CONDITION_OPTIONS,
  MAX_BOUGHT_FROM_LENGTH,
  MAX_ITEM_BRAND_LENGTH,
  MAX_ITEM_DESCRIPTION_LENGTH,
  MAX_ITEM_NOTES_LENGTH,
  MAX_ITEM_SIZE_LENGTH,
  MAX_ITEM_TITLE_LENGTH,
} from '@apps/going-once/constants';
import type { ThingAnswers } from '@apps/going-once/utils/thingAnswers';

export interface QuestionProps {
  answers: ThingAnswers;
  onChange: (patch: Partial<ThingAnswers>) => void;
}

export function NameQuestion({
  answers,
  onChange,
  onCommit,
}: QuestionProps & { onCommit?: () => void }) {
  return (
    <Input
      variant='outline'
      aria-label='Name'
      placeholder='Oak desk'
      maxLength={MAX_ITEM_TITLE_LENGTH}
      value={answers.title}
      onChange={(event) => onChange({ title: event.target.value })}
      onBlur={onCommit}
    />
  );
}

export function FloorField({ answers, onChange }: QuestionProps) {
  return (
    <div className='space-y-1'>
      <p className='text-sm font-medium'>🔒 Floor price</p>
      <MoneyInput
        ariaLabel='Floor price'
        value={answers.floor}
        onChange={(floor) => onChange({ floor })}
        autoFocus
        wrapperClassName='max-w-48'
      />
      <p className='text-muted-foreground text-xs'>
        Only you and your co-sellers see this. Buyers never do.
      </p>
    </div>
  );
}

/** The asking price (or Free), with the floor price revealed beside it unless `hasFloor` is false. */
export function PriceQuestion({
  answers,
  onChange,
  hasFloor = true,
}: QuestionProps & { hasFloor?: boolean }) {
  return (
    <div className='space-y-4'>
      {answers.isFree ? (
        <div className='space-y-3 text-center'>
          <p className='text-5xl font-semibold'>Free</p>
          <RevealChip onClick={() => onChange({ isFree: false })}>
            Set a price
          </RevealChip>
        </div>
      ) : (
        <AmountHero
          label='Asking price'
          value={answers.price}
          onChange={(price) => onChange({ price })}
          autoFocus
          ways={[
            {
              label: "It's free",
              onClick: () => onChange({ isFree: true, isFloorShown: false }),
            },
          ]}
        />
      )}
      {hasFloor &&
        !answers.isFree &&
        (answers.isFloorShown ? (
          <FloorField answers={answers} onChange={onChange} />
        ) : (
          <div className='flex justify-center'>
            <RevealChip
              icon='+'
              onClick={() => onChange({ isFloorShown: true })}
            >
              🔒 Floor price
            </RevealChip>
          </div>
        ))}
    </div>
  );
}

export function ConditionQuestion({ answers, onChange }: QuestionProps) {
  return (
    <PillGroup
      label='Condition'
      options={CONDITION_OPTIONS}
      value={answers.condition}
      onChange={(condition) => onChange({ condition })}
    />
  );
}

export function DescriptionQuestion({ answers, onChange }: QuestionProps) {
  return (
    <NoteTextField
      label='Description'
      value={answers.description}
      onChange={(description) => onChange({ description })}
      placeholder='Solid oak, a few light scratches on the top.'
      maxLength={MAX_ITEM_DESCRIPTION_LENGTH}
    />
  );
}

export function BrandQuestion({ answers, onChange }: QuestionProps) {
  return (
    <Field label='Brand or model'>
      {() => (
        <Input
          variant='outline'
          placeholder='IKEA Alex'
          maxLength={MAX_ITEM_BRAND_LENGTH}
          value={answers.brandModel}
          onChange={(event) => onChange({ brandModel: event.target.value })}
        />
      )}
    </Field>
  );
}

export function SizeQuestion({ answers, onChange }: QuestionProps) {
  return (
    <Field label='Size'>
      {() => (
        <Input
          variant='outline'
          placeholder='60 × 30 in'
          maxLength={MAX_ITEM_SIZE_LENGTH}
          value={answers.size}
          onChange={(event) => onChange({ size: event.target.value })}
        />
      )}
    </Field>
  );
}

export function ShowOriginalQuestion({ answers, onChange }: QuestionProps) {
  if (parseMoneyToCents(answers.original) === null)
    return (
      <p className='text-muted-foreground text-sm'>
        Add the original price first, then choose whether buyers see it.
      </p>
    );
  return (
    <label className='flex items-start gap-3'>
      <AppToggle
        checked={answers.showOriginalPrice}
        onCheckedChange={(showOriginalPrice) => onChange({ showOriginalPrice })}
        aria-label='Show original price to buyers'
      />
      <span className='text-sm'>
        <span className='font-medium'>Show to buyers</span>
        <span className='text-muted-foreground block'>
          {answers.showOriginalPrice
            ? 'Buyers see it beside your asking price.'
            : 'Only you and your co-sellers see it.'}
        </span>
      </span>
    </label>
  );
}

export function OriginalPriceQuestion({ answers, onChange }: QuestionProps) {
  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <p className='text-sm font-medium'>Original price</p>
        <MoneyInput
          ariaLabel='Original price'
          value={answers.original}
          onChange={(original) => onChange({ original })}
          wrapperClassName='max-w-48'
        />
      </div>
      <ShowOriginalQuestion answers={answers} onChange={onChange} />
    </div>
  );
}

export function BoughtQuestion({ answers, onChange }: QuestionProps) {
  return (
    <div className='space-y-4'>
      <Field label='Where you got it'>
        {() => (
          <Input
            variant='outline'
            placeholder='Target'
            maxLength={MAX_BOUGHT_FROM_LENGTH}
            value={answers.boughtFrom}
            onChange={(event) => onChange({ boughtFrom: event.target.value })}
          />
        )}
      </Field>
      <Field label='When'>
        {() => (
          <DateInput
            variant='outline'
            value={answers.boughtOn}
            onChange={(event) => onChange({ boughtOn: event.target.value })}
          />
        )}
      </Field>
      <LinkAttachField
        label="Store's page"
        addLabel="+ Add the store's link"
        url={answers.boughtUrl}
        preview={answers.boughtUrlPreview}
        startRevealed
        onChange={(boughtUrl, boughtUrlPreview) =>
          onChange({ boughtUrl, boughtUrlPreview })
        }
      />
    </div>
  );
}

export function NotesQuestion({ answers, onChange }: QuestionProps) {
  return (
    <NoteTextField
      label='Notes'
      value={answers.notes}
      onChange={(notes) => onChange({ notes })}
      placeholder='Bought in 2021; the left drawer sticks.'
      maxLength={MAX_ITEM_NOTES_LENGTH}
      rows={4}
    />
  );
}

import { Input } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import AppToggle from '@/components/AppToggle';
import DateInput from '@/components/DateInput';
import Field from '@/components/forms/Field';
import LinkAttachField from '@/components/forms/LinkAttachField';
import MoneyInput from '@/components/MoneyInput';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import SegmentedControl from '@/components/SegmentedControl';
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

/** A question's caption for a screen reader only, where its sheet's title already says it. */
const HIDE_FIELD_CAPTION = '[&_label>span:first-child]:sr-only';

const hiddenLabel = (text: string) => <span className='sr-only'>{text}</span>;

/** The floor price; `isTitled` is for a sheet whose title already says it. */
export function FloorField({
  answers,
  onChange,
  isTitled = false,
}: QuestionProps & { isTitled?: boolean }) {
  return (
    <div className='space-y-1'>
      {!isTitled && <p className='text-sm font-medium'>🔒 Floor price</p>}
      <MoneyInput
        ariaLabel='Floor price'
        value={answers.floor}
        onChange={(floor) => onChange({ floor })}
        autoFocus
        wrapperClassName={isTitled ? undefined : 'max-w-48'}
      />
      <p className='text-muted-foreground text-xs'>
        Only you and your co-sellers see this. Buyers never do.
      </p>
    </div>
  );
}

const PRICE_WAYS = [
  { value: 'price', label: 'Set a price' },
  { value: 'free', label: "It's free" },
] as const;

/** The asking price (or Free), with the floor price below it unless `hasFloor` is false. */
export function PriceQuestion({
  answers,
  onChange,
  hasFloor = true,
}: QuestionProps & { hasFloor?: boolean }) {
  return (
    <div className='space-y-4'>
      <SegmentedControl
        label='Price'
        options={PRICE_WAYS}
        value={answers.isFree ? 'free' : 'price'}
        onChange={(way) =>
          onChange(
            way === 'free'
              ? { isFree: true, isFloorShown: false }
              : { isFree: false },
          )
        }
      />
      {answers.isFree ? (
        <div className='space-y-1 py-2 text-center'>
          <p className='text-5xl font-semibold'>Free</p>
          <p className='text-muted-foreground text-sm'>
            Buyers see Free on its tag.
          </p>
        </div>
      ) : (
        <AmountHero
          label='Asking price'
          value={answers.price}
          onChange={(price) => onChange({ price })}
          autoFocus
        />
      )}
      {hasFloor && !answers.isFree && (
        <div className='bg-accent/60 border-border space-y-2 rounded-2xl border p-3'>
          <p className='text-accent-foreground text-sm font-semibold'>
            🔒 Lowest you'd take
          </p>
          <MoneyInput
            ariaLabel='Lowest you would take'
            value={answers.floor}
            onChange={(floor) => onChange({ floor, isFloorShown: true })}
            wrapperClassName='max-w-48'
          />
          <p className='text-muted-foreground text-xs'>
            Only you and your co-sellers see this. Buyers never do.
          </p>
        </div>
      )}
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
    <div className={HIDE_FIELD_CAPTION}>
      <NoteTextField
        label='Description'
        value={answers.description}
        onChange={(description) => onChange({ description })}
        placeholder='Solid oak, a few light scratches on the top.'
        maxLength={MAX_ITEM_DESCRIPTION_LENGTH}
      />
    </div>
  );
}

export function BrandQuestion({ answers, onChange }: QuestionProps) {
  return (
    <Field label={hiddenLabel('Brand or model')}>
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
    <Field label={hiddenLabel('Size')}>
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
        Add the original price above, then choose whether buyers see it.
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
      <MoneyInput
        ariaLabel='Original price'
        value={answers.original}
        onChange={(original) => onChange({ original })}
      />
      <ShowOriginalQuestion answers={answers} onChange={onChange} />
    </div>
  );
}

export function BoughtQuestion({ answers, onChange }: QuestionProps) {
  return (
    <div className='space-y-4'>
      <Field label={hiddenLabel('Where you got it')}>
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
    </div>
  );
}

export function StoreLinkQuestion({ answers, onChange }: QuestionProps) {
  return (
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
  );
}

export function NotesQuestion({ answers, onChange }: QuestionProps) {
  return (
    <div className={HIDE_FIELD_CAPTION}>
      <NoteTextField
        label='Notes'
        value={answers.notes}
        onChange={(notes) => onChange({ notes })}
        placeholder='Bought in 2021; the left drawer sticks.'
        maxLength={MAX_ITEM_NOTES_LENGTH}
        rows={4}
      />
    </div>
  );
}

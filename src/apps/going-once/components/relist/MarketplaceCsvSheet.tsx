import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppSelector } from '@/store';
import { toCsvFile } from '@/utils/csvUtils';
import { shareOrDownloadFiles } from '@/utils/fileUtils';
import {
  selectBundles,
  selectItems,
  selectSaleById,
} from '@apps/going-once/store/selectors';
import {
  getMarketplaceCaveats,
  getMarketplaceFileName,
  getMarketplaceThings,
  MARKETPLACE_ROWS_PER_FILE,
  toMarketplaceSheets,
} from '@apps/going-once/utils/marketplaceCsv';

const countThings = (count: number, verb?: string) =>
  `${count} ${count === 1 ? 'thing' : 'things'} ${verb ?? (count === 1 ? 'has' : 'have')}`;

const describeThings = (count: number) =>
  `${count} available ${count === 1 ? 'thing' : 'things'}`;

interface MarketplaceCsvSheetProps {
  saleId: string;
  onClose: () => void;
}

/** Marketplace spreadsheet: the Available things as CSV in Facebook's bulk upload layout, split into files of 50. */
function MarketplaceCsvSheet({ saleId, onClose }: MarketplaceCsvSheetProps) {
  const items = useAppSelector((state) => selectItems(state, saleId));
  const bundles = useAppSelector((state) => selectBundles(state, saleId));
  const saleName = useAppSelector(
    (state) => selectSaleById(state, saleId)?.name ?? '',
  );
  const [outcome, setOutcome] = useState<string | null>(null);
  const things = getMarketplaceThings(items, bundles);
  const sheets = toMarketplaceSheets(things);
  const { noCondition, wellUsed, withCents } = getMarketplaceCaveats(things);
  const caveats = [
    noCondition > 0 &&
      `${countThings(noCondition)} no condition yet. Facebook asks for one, so pick it there.`,
    wellUsed > 0 &&
      `${countThings(wellUsed, 'marked')} Well used. Facebook's closest is Used - Fair, so ${wellUsed === 1 ? 'it goes' : 'they go'} in as that.`,
    withCents > 0 &&
      `${countThings(withCents)} a price with cents. Facebook takes whole dollars, so ${withCents === 1 ? 'it is' : 'they are'} rounded to the nearest dollar.`,
  ].filter((line) => line !== false);

  const save = async () => {
    const files = sheets.map((rows, index) =>
      toCsvFile(rows, getMarketplaceFileName(saleName, index, sheets.length)),
    );
    try {
      const done = await shareOrDownloadFiles(files, {
        title: `${saleName} for Marketplace`,
      });
      if (done === 'cancelled') return;
      setOutcome(
        done === 'downloaded'
          ? `Saved ${files.length === 1 ? 'the file' : `${files.length} files`} to your downloads.`
          : 'Saved. Upload it on Marketplace to make the listings.',
      );
    } catch {
      setOutcome("Couldn't open the share sheet. Tap Save to try again.");
    }
  };

  const getSummary = () => {
    if (things.length === 0)
      return 'Nothing to put in it yet. Available things with a photo, name and price land here.';
    const files =
      sheets.length > 1
        ? ` · ${sheets.length} files, since Facebook takes ${MARKETPLACE_ROWS_PER_FILE} at a time`
        : '';
    return `${describeThings(things.length)}${files}`;
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Marketplace spreadsheet'>
      <div className='space-y-3 pb-4'>
        <p className='text-foreground font-medium text-pretty'>
          {getSummary()}
        </p>
        <p className='text-muted-foreground text-sm'>
          A CSV in Facebook’s bulk upload layout, with each thing’s name, price,
          condition and description: only what buyers already see. Add the
          photos to each listing on Facebook after uploading.
        </p>
        <p className='text-muted-foreground text-sm'>
          Drafts, Pending and Sold things, and things sold only in a bundle, are
          left out.
        </p>
        {caveats.map((line) => (
          <p key={line} className='text-muted-foreground text-sm'>
            {line}
          </p>
        ))}
        {outcome !== null && (
          <p className='text-foreground text-sm' role='status'>
            {outcome}
          </p>
        )}
      </div>
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='tertiary' onClick={onClose}>
            Close
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={things.length === 0}
            onClick={() => void save()}
          >
            {sheets.length > 1 ? `Save ${sheets.length} files` : 'Save the CSV'}
          </Button>
        }
      />
    </FormSheet>
  );
}

export default MarketplaceCsvSheet;

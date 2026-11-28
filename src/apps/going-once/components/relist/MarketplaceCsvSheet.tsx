import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { FileSpreadsheet } from 'lucide-react';

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

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

interface MarketplaceCsvSheetProps {
  saleId: string;
  onClose: () => void;
  /** Opens the photo zip; null when no thing has a photo to save. */
  onSavePhotos: (() => void) | null;
}

/** Marketplace spreadsheet: the Available things as CSV in Facebook's bulk upload layout, split into files of 50, then a step on to the photos the upload can't carry. */
function MarketplaceCsvSheet({
  saleId,
  onClose,
  onSavePhotos,
}: MarketplaceCsvSheetProps) {
  const items = useAppSelector((state) => selectItems(state, saleId));
  const bundles = useAppSelector((state) => selectBundles(state, saleId));
  const saleName = useAppSelector(
    (state) => selectSaleById(state, saleId)?.name ?? '',
  );
  const [outcome, setOutcome] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const things = getMarketplaceThings(items, bundles);
  const sheets = toMarketplaceSheets(things);
  const { noCondition, wellUsed, withCents } = getMarketplaceCaveats(things);
  const caveats = [
    noCondition > 0 &&
      `${plural(noCondition, 'thing needs', 'things need')} a condition picked on Facebook.`,
    wellUsed > 0 &&
      `${plural(wellUsed, 'Well used thing goes', 'Well used things go')} in as Used - Fair.`,
    withCents > 0 &&
      `${plural(withCents, 'price rounds', 'prices round')} to the whole dollar.`,
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
      setIsSaved(true);
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
    if (things.length === 0) return 'Nothing Available to list right now';
    const files =
      sheets.length > 1
        ? `${sheets.length} files of up to ${MARKETPLACE_ROWS_PER_FILE}`
        : '1 CSV file';
    return `${plural(things.length, 'thing', 'things')} · ${files}`;
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Marketplace spreadsheet'>
      <div className='space-y-3 pb-4'>
        <p className='text-foreground flex items-center gap-2 font-medium'>
          <FileSpreadsheet className='size-4 shrink-0' aria-hidden='true' />
          {getSummary()}
        </p>
        <p className='text-foreground text-sm text-pretty'>
          {onSavePhotos === null
            ? 'Upload it on Facebook Marketplace to make every listing at once.'
            : 'Upload it on Facebook Marketplace to make every listing at once. The upload takes no photos, so save them next: a folder for each thing, named like its listing.'}
        </p>
        <p className='text-muted-foreground text-sm text-pretty'>
          {[
            'Only what buyers already see. Drafts, Pending, Sold and bundle-only things stay out.',
            ...caveats,
          ].join(' ')}
        </p>
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
          isSaved && onSavePhotos !== null ? (
            <Button type='button' onClick={onSavePhotos}>
              Save the photos
            </Button>
          ) : (
            <Button
              type='button'
              disabled={things.length === 0}
              onClick={() => void save()}
            >
              {sheets.length > 1
                ? `Save ${sheets.length} files`
                : 'Save the CSV'}
            </Button>
          )
        }
      />
    </FormSheet>
  );
}

export default MarketplaceCsvSheet;

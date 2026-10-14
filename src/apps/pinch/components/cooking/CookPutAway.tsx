import { Button } from '@moondreamsdev/dreamer-ui/components';

import Pill from '@/components/Pill';
import ContainerFields from '@apps/pinch/components/containers/ContainerFields';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import type { usePutAway } from '@apps/pinch/hooks/usePutAway';
import { getSavedText, groupSavedBatches } from '@apps/pinch/utils/containers';

interface CookPutAwayProps {
  putAway: ReturnType<typeof usePutAway>;
}

function CookPutAway({ putAway }: CookPutAwayProps) {
  if (!putAway.isAvailable) {
    return null;
  }

  if (putAway.fields) {
    const { place } = putAway.fields;
    return (
      <div className='w-full max-w-md space-y-3 text-left'>
        <p className='font-medium'>
          {putAway.isPlaceFixed
            ? `Put some in the ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`
            : 'Put some away'}
        </p>
        <ContainerFields
          draft={putAway.fields}
          isPlaceFixed={putAway.isPlaceFixed}
        />
        {putAway.error && (
          <p className='text-destructive text-sm' role='alert'>
            {putAway.error}
          </p>
        )}
      </div>
    );
  }

  const hasSaved = putAway.saved.length > 0;

  return (
    <div className='flex flex-col items-center gap-2'>
      {groupSavedBatches(putAway.saved).map((batch) => (
        <p key={batch[0].id} className='text-sm text-balance'>
          {getSavedText(batch)}
        </p>
      ))}
      {putAway.isAsking ? (
        <div className='space-y-2'>
          <p className='font-medium'>Putting any away?</p>
          <div className='flex flex-wrap justify-center gap-2'>
            <Pill isSelected={false} onClick={putAway.dismiss}>
              Not this time
            </Pill>
            {(['FRIDGE', 'FREEZER'] as const).map((place) => (
              <Pill
                key={place}
                isSelected={false}
                emoji={CONTAINER_PLACE_EMOJIS[place]}
                onClick={() => putAway.open(place)}
              >
                {`In the ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`}
              </Pill>
            ))}
          </div>
        </div>
      ) : (
        <Button
          type='button'
          variant='link'
          className='h-10'
          onClick={() => putAway.open('FRIDGE', false)}
        >
          {hasSaved ? 'Put another away' : 'Put some away'}
        </Button>
      )}
    </div>
  );
}

export default CookPutAway;

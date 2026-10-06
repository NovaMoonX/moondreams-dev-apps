import TheaterList from '@apps/a-list/components/theaters/TheaterList';
import TheaterPicker from '@apps/a-list/components/theaters/TheaterPicker';
import type { TheatreDraft } from '@apps/a-list/types';

export interface TheatersStepValues {
  theatres: TheatreDraft[];
  favoriteTheatreId: string | null;
}

interface TheatersStepProps {
  values: TheatersStepValues;
  onChange: (values: TheatersStepValues) => void;
}

function TheatersStep({ values, onChange }: TheatersStepProps) {
  const { theatres, favoriteTheatreId } = values;

  const handleAdd = (theatre: TheatreDraft) =>
    onChange({
      theatres: [...theatres, theatre],
      favoriteTheatreId:
        theatres.length === 0 ? theatre.theatreId : favoriteTheatreId,
    });

  const handleRemove = (theatreId: string) => {
    const remaining = theatres.filter((item) => item.theatreId !== theatreId);
    onChange({
      theatres: remaining,
      favoriteTheatreId:
        favoriteTheatreId === theatreId
          ? (remaining[0]?.theatreId ?? null)
          : favoriteTheatreId,
    });
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-2 text-center'>
        <p className='text-5xl' aria-hidden='true'>
          📍
        </p>
        <h3 className='text-xl font-semibold'>Where do you catch movies?</h3>
        <p className='text-muted-foreground text-sm'>
          Add the AMC theaters you go to and we'll tag your movies with them.
          You can skip this and add them any time.
        </p>
      </div>
      {theatres.length > 1 && (
        <p className='text-muted-foreground text-center text-sm'>
          Tap the star on the one you go to most.
        </p>
      )}
      {theatres.length > 0 && (
        <TheaterList
          theatres={theatres}
          favoriteId={favoriteTheatreId}
          onToggleFavorite={(theatreId) =>
            onChange({
              ...values,
              favoriteTheatreId:
                theatreId === favoriteTheatreId ? null : theatreId,
            })
          }
          onRemove={(theatre) => handleRemove(theatre.theatreId)}
        />
      )}
      <TheaterPicker
        savedIds={theatres.map((theatre) => theatre.theatreId)}
        savedNames={theatres.map((theatre) => theatre.name)}
        onAdd={handleAdd}
      />
    </div>
  );
}

export default TheatersStep;

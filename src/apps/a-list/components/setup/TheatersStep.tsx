import TheaterFinder from '@apps/a-list/components/theaters/TheaterFinder';
import TheaterList from '@apps/a-list/components/theaters/TheaterList';
import type { TheatreSearchResult } from '@apps/a-list/types';

export interface TheatersStepValues {
  theatres: TheatreSearchResult[];
  favoriteTheatreId: string | null;
}

interface TheatersStepProps {
  values: TheatersStepValues;
  onChange: (values: TheatersStepValues) => void;
}

function TheatersStep({ values, onChange }: TheatersStepProps) {
  const { theatres, favoriteTheatreId } = values;

  const handleAdd = (theatre: TheatreSearchResult) =>
    onChange({
      theatres: [...theatres, theatre],
      favoriteTheatreId: favoriteTheatreId ?? theatre.theatreId,
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
      <TheaterFinder
        savedIds={theatres.map((theatre) => theatre.theatreId)}
        onAdd={handleAdd}
      />
    </div>
  );
}

export default TheatersStep;

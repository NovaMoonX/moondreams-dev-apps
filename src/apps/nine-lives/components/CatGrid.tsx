import type { Cat } from '@apps/nine-lives/types';

import CatCard from './CatCard';

interface CatGridProps {
  cats: Cat[];
  onSelect?: (cat: Cat) => void;
}

function CatGrid({ cats, onSelect }: CatGridProps) {
  if (cats.length === 0) {
    return (
      <div className='rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground'>
        No cats added yet.
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
      {cats.map((cat) => (
        <CatCard key={cat.id} cat={cat} onClick={onSelect} />
      ))}
    </div>
  );
}

export default CatGrid;

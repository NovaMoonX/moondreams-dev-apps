import { useMemo, useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { ConditionCategory, LibraryCondition } from '@apps/nine-lives/types';

interface ConditionLibraryBrowserProps {
  conditions: LibraryCondition[];
  selectedCategory?: ConditionCategory | 'all';
  searchTerm?: string;
  onCategoryChange?: (category: ConditionCategory | 'all') => void;
  onSelect?: (condition: LibraryCondition) => void;
}

export function ConditionLibraryBrowser({
  conditions,
  selectedCategory = 'all',
  searchTerm = '',
  onCategoryChange,
  onSelect,
}: ConditionLibraryBrowserProps) {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const activeCategory = selectedCategory;
  const activeSearchTerm = localSearchTerm.trim().toLowerCase();

  const categories: Array<ConditionCategory | 'all'> = [
    'all',
    'illness',
    'injury',
    'chronic',
    'parasite',
    'allergy',
    'other',
  ];

  const filteredConditions = useMemo(() => {
    return conditions.filter((condition) => {
      const matchesCategory =
        activeCategory === 'all' || condition.category === activeCategory;
      const matchesSearch =
        activeSearchTerm.length === 0 ||
        condition.name.toLowerCase().includes(activeSearchTerm) ||
        condition.description.toLowerCase().includes(activeSearchTerm);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, activeSearchTerm, conditions]);

  return (
    <div className={join('space-y-4 rounded-lg border border-border bg-card p-4')}>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => {
          const label = category === 'all' ? 'All' : category;
          const isActive = activeCategory === category;

          return (
            <button
              key={category}
              type="button"
              className={join(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-transparent text-foreground',
              )}
              onClick={() => onCategoryChange?.(category)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={localSearchTerm}
        onChange={(event) => setLocalSearchTerm(event.target.value)}
        className={join(
          'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
        )}
        placeholder="Search the condition library"
      />

      <div className="space-y-2">
        {filteredConditions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matching condition library entries found.
          </p>
        ) : (
          filteredConditions.map((condition) => (
            <button
              key={condition.id}
              type="button"
              className={join(
                'flex w-full flex-col items-start rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50',
              )}
              onClick={() => onSelect?.(condition)}
            >
              <span className="font-medium text-foreground">{condition.name}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {condition.category}
              </span>
              <span className="mt-1 text-sm text-muted-foreground">
                {condition.description}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default ConditionLibraryBrowser;

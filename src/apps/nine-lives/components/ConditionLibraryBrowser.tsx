import { useMemo, useState } from 'react';

import { Badge, Button, Input, Tabs } from '@moondreamsdev/dreamer-ui/components';

import type { ConditionCategory, LibraryCondition } from '../types';
import { CONDITION_CATEGORIES, getConditionCategoryLabel } from '../utils/conditionCategories';

interface ConditionLibraryBrowserProps {
  conditions: LibraryCondition[];
  selectedConditionId?: string | null;
  onSelect: (condition: LibraryCondition) => void;
}

const CATEGORY_FILTERS: Array<ConditionCategory | 'all'> = ['all', ...CONDITION_CATEGORIES];

function ConditionLibraryBrowser({
  conditions,
  selectedConditionId,
  onSelect,
}: ConditionLibraryBrowserProps) {
  const [activeCategory, setActiveCategory] = useState<ConditionCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConditions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return conditions.filter((condition) => {
      const matchesCategory = activeCategory === 'all' || condition.category === activeCategory;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        condition.name.toLowerCase().includes(normalizedSearch) ||
        condition.description.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, conditions, searchTerm]);

  return (
    <div className='space-y-3'>
      <Input
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder='Search the condition library'
        variant='outline'
      />

      <Tabs
        value={activeCategory}
        onValueChange={(value) => setActiveCategory(value as ConditionCategory | 'all')}
        tabsWidth='fit'
        variant='pills'
        tabsList={CATEGORY_FILTERS.map((category) => ({
          value: category,
          label: category === 'all' ? 'All' : getConditionCategoryLabel(category),
        }))}
      />

      <div className='max-h-64 space-y-2 overflow-y-auto'>
        {filteredConditions.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No matching condition library entries found.</p>
        ) : (
          filteredConditions.map((condition) => (
            <Button
              key={condition.id}
              type='button'
              variant={condition.id === selectedConditionId ? 'primary' : 'secondary'}
              onClick={() => onSelect(condition)}
              className='flex w-full flex-col items-start gap-1 text-left'
            >
              <span className='flex w-full items-center justify-between gap-2'>
                <span className='font-medium'>{condition.name}</span>
                <Badge variant='muted' outline>
                  {getConditionCategoryLabel(condition.category)}
                </Badge>
              </span>
              <span className='text-sm opacity-80'>{condition.description}</span>
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

export default ConditionLibraryBrowser;

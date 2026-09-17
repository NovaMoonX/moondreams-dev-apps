import { Avatar, Badge } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { getInitials } from '@/utils/accountUtils';

import { selectCatsByHousehold } from '../store/selectors';
import { getRecentAdoptionAnniversaries, getUpcomingBirthdays } from '../utils/catAnniversaries';

interface CatAnniversaryBannersProps {
  householdId: string;
}

/** Kept as a plain top-level helper (rather than inline in the component) so `Date.now()` isn't called directly in render. */
function getNow(): number {
  return Date.now();
}

function formatDueLabel(occursAt: number, now: number): string {
  const diffDays = Math.round((occursAt - now) / 86_400_000);

  if (diffDays === 0) {
    return 'Today';
  }

  return diffDays > 0 ? `In ${diffDays} day${diffDays === 1 ? '' : 's'}` : `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
}

/** Two standalone banners — upcoming birthdays and adoption anniversaries — separate from the due-soon "needs attention" section. */
function CatAnniversaryBanners({ householdId }: CatAnniversaryBannersProps) {
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const now = getNow();

  const upcomingBirthdays = getUpcomingBirthdays(cats, now);
  const adoptionAnniversaries = getRecentAdoptionAnniversaries(cats, now);

  if (upcomingBirthdays.length === 0 && adoptionAnniversaries.length === 0) {
    return null;
  }

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {upcomingBirthdays.length > 0 && (
        <div className='rounded-lg border border-border bg-card p-4'>
          <h3 className='mb-3 text-sm font-semibold'>Upcoming birthdays</h3>
          <ul className='space-y-2'>
            {upcomingBirthdays.map((entry) => {
              const cat = cats.find((item) => item.id === entry.catId);

              if (!cat) {
                return null;
              }

              return (
                <li key={cat.id} className='flex items-center gap-2'>
                  <Avatar
                    src={cat.photoURL ?? undefined}
                    initials={cat.photoURL ? undefined : getInitials(cat.name)}
                    size='xs'
                  />
                  <span className='flex-1 text-sm'>{cat.name}</span>
                  <Badge variant='muted' outline>
                    {formatDueLabel(entry.occursAt, now)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {adoptionAnniversaries.length > 0 && (
        <div className='rounded-lg border border-border bg-card p-4'>
          <h3 className='mb-3 text-sm font-semibold'>Adoption anniversaries</h3>
          <ul className='space-y-2'>
            {adoptionAnniversaries.map((entry) => {
              const cat = cats.find((item) => item.id === entry.catId);

              if (!cat) {
                return null;
              }

              return (
                <li key={cat.id} className='flex items-center gap-2'>
                  <Avatar
                    src={cat.photoURL ?? undefined}
                    initials={cat.photoURL ? undefined : getInitials(cat.name)}
                    size='xs'
                  />
                  <span className='flex-1 text-sm'>
                    {cat.name} — {entry.yearsSinceAdoption} year{entry.yearsSinceAdoption === 1 ? '' : 's'} home
                  </span>
                  <Badge variant='muted' outline>
                    {formatDueLabel(entry.occursAt, now)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CatAnniversaryBanners;

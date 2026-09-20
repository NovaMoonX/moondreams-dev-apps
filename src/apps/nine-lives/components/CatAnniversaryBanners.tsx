import { Avatar } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
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

function getBirthdayCopy(daysUntil: number): string {
  if (daysUntil === 0) {
    return "It's their birthday today! 🎉";
  }

  return `Birthday countdown — ${daysUntil} day${daysUntil === 1 ? '' : 's'} to go!`;
}

function getAnniversaryCopy(daysSince: number, yearsSinceAdoption: number): string {
  const years = `${yearsSinceAdoption} year${yearsSinceAdoption === 1 ? '' : 's'}`;

  if (daysSince === 0) {
    return `Gotcha day! Joined the family ${years} ago today`;
  }

  return `Gotcha day was ${daysSince} day${daysSince === 1 ? '' : 's'} ago — ${years} home now`;
}

/** Two standalone, celebratory banners — upcoming birthdays and adoption anniversaries — separate from the due-soon "needs attention" section. */
function CatAnniversaryBanners({ householdId }: CatAnniversaryBannersProps) {
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const now = getNow();

  const upcomingBirthdays = getUpcomingBirthdays(cats, now);
  const adoptionAnniversaries = getRecentAdoptionAnniversaries(cats, now);

  if (upcomingBirthdays.length === 0 && adoptionAnniversaries.length === 0) {
    return null;
  }

  const showBoth = upcomingBirthdays.length > 0 && adoptionAnniversaries.length > 0;

  return (
    <div className={join('grid gap-4', showBoth && 'md:grid-cols-2')}>
      {upcomingBirthdays.length > 0 && (
        <div className='rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40'>
          <h3 className='mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200'>
            🎂 Upcoming birthdays
          </h3>
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
                    size='sm'
                  />
                  <span className='text-sm font-medium text-amber-950 dark:text-amber-100'>
                    {cat.name} — {getBirthdayCopy(entry.daysUntil)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {adoptionAnniversaries.length > 0 && (
        <div className='rounded-lg border border-sky-300 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/40'>
          <h3 className='mb-3 flex items-center gap-1.5 text-sm font-semibold text-sky-900 dark:text-sky-200'>
            🏡 Adoption anniversaries
          </h3>
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
                    size='sm'
                  />
                  <span className='text-sm font-medium text-sky-950 dark:text-sky-100'>
                    {cat.name} — {getAnniversaryCopy(entry.daysSince, entry.yearsSinceAdoption)}
                  </span>
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

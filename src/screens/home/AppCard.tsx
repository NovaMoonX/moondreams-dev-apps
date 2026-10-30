import { Link } from 'react-router-dom';

import AppLogo from '@/components/AppLogo';
import StarButton from '@/components/StarButton';
import type { AppMetadata } from '@lib/types/appCatalog';

interface AppCardProps {
  app: AppMetadata;
  href: string;
  isStarred: boolean;
  /** Absent when signed out, since a star needs an account to keep it. */
  onToggleStar: (() => void) | null;
}

/** An app with its description; the whole card opens it and the star sits beside the name. */
function AppCard({ app, href, isStarred, onToggleStar }: AppCardProps) {
  return (
    <div className='border-border bg-card hover:border-primary/40 relative rounded-3xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'>
      <Link
        to={href}
        state={{ resumed: true }}
        aria-label={`Open ${app.name}`}
        className='flex flex-col gap-4 rounded-3xl p-5 text-left'
      >
        <span className='flex items-center gap-4 pr-10'>
          <AppLogo appId={app.id} className='size-16 rounded-2xl shadow-sm' />
          <span className='text-foreground min-w-0 flex-1 text-xl font-semibold tracking-tight'>{app.name}</span>
        </span>
        <span className='text-foreground/60 line-clamp-3 text-sm'>{app.description}</span>
      </Link>
      {onToggleStar ? (
        <div className='absolute top-4 right-3'>
          <StarButton isOn={isStarred} label={`Star ${app.name}`} onClick={onToggleStar} />
        </div>
      ) : null}
    </div>
  );
}

export default AppCard;

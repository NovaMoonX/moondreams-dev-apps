import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { APP_DESCRIPTION, APP_TITLE } from '@lib/app';

function Home() {
  const { user } = useAuth();
  const { apps, loading } = useAppCatalog();

  return (
    <div className='page flex items-center justify-center'>
      <div className='w-full max-w-4xl'>
        <header className='mb-10 flex items-center justify-center'>
          <div className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
            {APP_TITLE}
          </div>
        </header>

        <main className='space-y-6 text-center'>
          <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-6xl'>
            For <span className='px-1 font-serif italic'>some</span> moment.
          </h1>
          <p className='text-foreground/70 mx-auto max-w-xl text-base md:text-lg'>
            {APP_DESCRIPTION}
          </p>
        </main>

        {loading ? (
          <div className='text-foreground/60 mt-12 text-center text-sm'>
            Loading apps...
          </div>
        ) : apps.length === 0 ? (
          <div className='border-border bg-card text-foreground/70 mx-auto mt-12 max-w-2xl rounded-3xl border px-5 py-4 text-center text-sm'>
            {user
              ? 'No apps available for your account.'
              : 'No apps generally available. Please sign in to see apps available for your account.'}
          </div>
        ) : (
          <nav className='mt-12 grid gap-4 sm:grid-cols-2'>
            {apps.map((app) => (
              <Link
                key={app.id}
                to={app.path}
                aria-label={`Open ${app.name}`}
                className='group border-border bg-card hover:border-primary/40 flex flex-col gap-4 rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
              >
                <div className='flex items-center gap-4'>
                  <img
                    src={`/logos/by-app/logo-${app.id}.svg`}
                    alt=''
                    className='h-16 w-16 shrink-0 rounded-2xl shadow-sm'
                  />
                  <h2 className='text-foreground min-w-0 flex-1 text-xl font-semibold tracking-tight'>
                    {app.name}
                  </h2>
                  <span className='bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full transition'>
                    <ChevronRight className='h-5 w-5' />
                  </span>
                </div>
                <p className='text-foreground/60 line-clamp-3 text-sm'>
                  {app.description}
                </p>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

export default Home;

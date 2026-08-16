import { Button } from '@moondreamsdev/dreamer-ui/components';

import { APP_CATALOG, APP_DESCRIPTION, APP_TITLE } from '@lib/app';

function Home() {
  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-2xl'>
        <header className='mb-10 flex items-center justify-between'>
          <div className='text-xs font-medium uppercase tracking-[0.24em] text-foreground/60'>
            {APP_TITLE}
          </div>
        </header>

        <main className='space-y-6 text-center'>
          <h1 className='text-4xl font-semibold tracking-tight text-foreground md:text-6xl'>
            For <span className='italic font-serif px-1'>some</span> moment.
          </h1>
          <p className='mx-auto max-w-xl text-base text-foreground/70 md:text-lg'>
            {APP_DESCRIPTION}
          </p>
        </main>

        <nav className='mt-12 space-y-3'>
          {APP_CATALOG.map((app) => (
            <div
              key={app.id}
              className='flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm'
            >
              <div>
                <div className='text-lg font-medium text-foreground'>{app.name}</div>
                <p className='text-sm text-foreground/60'>{app.description}</p>
              </div>

              <Button href={app.path} className='shrink-0'>
                Open
              </Button>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default Home;

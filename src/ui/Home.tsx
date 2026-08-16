import { APP_CATALOG, APP_DESCRIPTION, APP_TITLE } from '@lib/app';
import NavButton from './NavButton';

function Home() {
  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-2xl'>
        <header className='mb-10 flex items-center justify-between'>
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

        <nav className='mt-12 space-y-3'>
          {APP_CATALOG.map((app) => (
            <div
              key={app.id}
              className='border-border bg-card flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 shadow-sm'
            >
              <div>
                <div className='text-foreground text-lg font-medium'>
                  {app.name}
                </div>
                <p className='text-foreground/60 text-sm'>{app.description}</p>
              </div>

              <NavButton href={app.path}>Open</NavButton>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default Home;

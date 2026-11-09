import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';

interface TodayViewProps {
  onBack: () => void;
  onHome: () => void;
}

/** Today, drawn as its first run until there is a day to plan. */
function TodayView({ onBack, onHome }: TodayViewProps) {
  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>Today</h1>
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {HELM_COPY.todayFirstRun}
        </p>
      </main>
    </>
  );
}

export default TodayView;

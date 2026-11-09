import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';

interface ActivityScreenProps {
  onBack: () => void;
  onHome: () => void;
}

function ActivityScreen({ onBack, onHome }: ActivityScreenProps) {
  return (
    <main className='flex flex-1 flex-col gap-6'>
      <HelmHeader
        backLabel='Settings'
        onBack={onBack}
        onHome={onHome}
        showsHome={false}
      />
      <h1 className='helm-serif text-[28px] leading-[34px]'>
        {HELM_COPY.activityTitle}
      </h1>
    </main>
  );
}

export default ActivityScreen;

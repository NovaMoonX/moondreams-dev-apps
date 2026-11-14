import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Bot, ChevronRight, Download, MessagesSquare } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import { ClaudeMark, GeminiMark } from '@/components/BrandMarks';
import CopyTextButton from '@/components/CopyTextButton';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import { shareOrDownloadFiles } from '@/utils/fileUtils';
import { formatDateShort } from '@/utils/formatUtils';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import AssistantSheet from '@apps/helm/components/settings/AssistantSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { helmAppName } from '@apps/helm/queries/helmKeyQueries';

interface ConnectedAssistantsScreenProps {
  onBack: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ICON_PATH = '/logos/helm-assistant-icon.png';

// Fetched before the tap: a phone refuses a share sheet opened after a slow await.
const fetchIconFile = async () => {
  const response = await fetch(ICON_PATH);
  if (!response.ok) throw new Error('icon');
  return new File([await response.blob()], `${helmAppName}.png`, {
    type: 'image/png',
  });
};

const startOfDay = (at: number) => new Date(at).setHours(0, 0, 0, 0);

const formatLastUsed = (at: number, now: number) => {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : formatDateShort(at);
};

/** A utility screen: the outside assistants the person connected, and how to connect another. */
function ConnectedAssistantsScreen({ onBack }: ConnectedAssistantsScreenProps) {
  const { items, isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.assistants,
  );
  const now = useNow(60_000);
  const name = useAssistantName();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = items.find((entry) => entry.clientKey === openKey) ?? null;
  const icon = useQuery({
    queryKey: ['helm', 'assistantIcon'],
    queryFn: fetchIconFile,
    staleTime: Infinity,
  });
  const [isIconFailed, setIsIconFailed] = useState(false);
  const downloadIcon = () => {
    if (!icon.data) {
      setIsIconFailed(true);
      void icon.refetch();
      return;
    }
    setIsIconFailed(false);
    shareOrDownloadFiles([icon.data], { title: helmAppName }).catch(() =>
      setIsIconFailed(true),
    );
  };

  return (
    <>
      <main className='flex flex-1 flex-col gap-6'>
        <HelmHeader
          backLabel={HELM_COPY.settingsTitle}
          onBack={onBack}
          onHome={onBack}
          showsHome={false}
        />
        <div className='flex flex-col gap-2'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.assistantsRowTitle}
          </h1>
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.assistantsLead(helmAppName)}
          </p>
        </div>
        {isFailed && (
          <p className='helm-card p-4 text-[15px] text-pretty' role='alert'>
            {HELM_COPY.assistantsFailed}
          </p>
        )}
        {!isLoaded && !isFailed && (
          <p className='text-muted-foreground text-[13px]' role='status'>
            {HELM_COPY.assistantsLoading}
          </p>
        )}
        {items.length > 0 && (
          <section className='flex flex-col gap-3'>
            <SectionHeader title={HELM_COPY.assistantsListHeading} />
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {items.map((assistant) => (
                <li key={assistant.clientKey}>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='flex h-auto w-full items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                    onClick={() => setOpenKey(assistant.clientKey)}
                  >
                    <Bot className='size-5 shrink-0' aria-hidden='true' />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-[15px] font-medium'>
                        {assistant.name}
                      </span>
                      <span className='text-muted-foreground block text-[13px]'>
                        {HELM_COPY.assistantLastUsed(
                          formatLastUsed(assistant.lastUsedAt, now),
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {isLoaded && (
          <section className='flex flex-col gap-3'>
            <SectionHeader title={HELM_COPY.assistantsConnectHeading} />
            <div className='helm-card flex flex-col gap-4 p-4'>
              <div className='flex flex-col gap-2'>
                <p className='text-[13px] font-medium'>
                  {HELM_COPY.assistantsAddressLabel(helmAppName)}
                </p>
                <p className='bg-muted rounded-[10px] px-3 py-2 text-[13px] break-all'>
                  {HELM_COPY.assistantsAddress}
                </p>
                <CopyTextButton
                  text={HELM_COPY.assistantsAddress}
                  label={HELM_COPY.assistantsCopyAddress}
                  variant='secondary'
                  className='self-start'
                />
              </div>
              <div className='flex flex-col gap-2'>
                <p className='text-[13px] font-medium'>
                  {HELM_COPY.assistantsDescriptionLabel}
                </p>
                <p className='bg-muted rounded-[10px] px-3 py-2 text-[13px] text-pretty'>
                  {HELM_COPY.assistantsDescription(helmAppName)}
                </p>
                <div className='flex flex-wrap gap-2'>
                  <CopyTextButton
                    text={HELM_COPY.assistantsDescription(helmAppName)}
                    label={HELM_COPY.assistantsCopyDescription}
                    variant='secondary'
                  />
                  <Button
                    type='button'
                    variant='secondary'
                    className='gap-1.5'
                    onClick={downloadIcon}
                    aria-label={`${HELM_COPY.assistantsDownloadIcon} (${HELM_COPY.assistantsIconLabel})`}
                  >
                    <Download className='size-4' aria-hidden='true' />
                    {HELM_COPY.assistantsDownloadIcon}
                  </Button>
                </div>
                {isIconFailed && (
                  <p className='text-muted-foreground text-[13px]' role='alert'>
                    {HELM_COPY.assistantsIconFailed}
                  </p>
                )}
              </div>
              <div className='flex flex-col gap-1'>
                <h3 className='flex items-center gap-2 text-[15px] font-medium'>
                  <ClaudeMark className='size-5' />
                  {HELM_COPY.assistantsClaudeHeading}
                </h3>
                <ol className='text-muted-foreground list-decimal pl-5 text-[15px] text-pretty'>
                  {HELM_COPY.assistantsClaudeSteps(name).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <div className='flex flex-col gap-1'>
                <h3 className='flex items-center gap-2 text-[15px] font-medium'>
                  <MessagesSquare className='size-5' aria-hidden='true' />
                  {HELM_COPY.assistantsChatGptHeading}
                </h3>
                <ol className='text-muted-foreground list-decimal pl-5 text-[15px] text-pretty'>
                  {HELM_COPY.assistantsChatGptSteps(name).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <div className='flex flex-col gap-1'>
                <h3 className='flex items-center gap-2 text-[15px] font-medium'>
                  <GeminiMark className='size-5' />
                  {HELM_COPY.assistantsGeminiHeading}
                </h3>
                <ol className='text-muted-foreground list-decimal pl-5 text-[15px] text-pretty'>
                  {HELM_COPY.assistantsGeminiSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <p className='text-muted-foreground text-[13px] text-pretty'>
                {HELM_COPY.assistantsAfterConnect(name)}
              </p>
            </div>
          </section>
        )}
      </main>
      <AssistantSheet assistant={open} onClose={() => setOpenKey(null)} />
    </>
  );
}

export default ConnectedAssistantsScreen;

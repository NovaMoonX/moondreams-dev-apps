import type { ReactNode } from 'react';

import DetailSheet from '@/components/DetailSheet';
import ExternalLinkText from '@/components/ExternalLinkText';
import SectionDivider from '@/components/SectionDivider';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenResearch } from '@apps/helm/types';

interface ResearchSheetProps {
  research: OpenResearch | null;
  onClose: () => void;
  /** What a saved-for-later item adds below the overview (its videos). */
  extra?: ReactNode;
  /** Where a saved-for-later item's actions sit, apart from what it says. */
  footer?: ReactNode;
  /** Said in place of "couldn't put anything together" while there is no overview yet. */
  emptyText?: string;
}

function Comparison({
  comparison,
}: {
  comparison: NonNullable<OpenResearch['overview']>['comparison'];
}) {
  if (!comparison || comparison.rows.length === 0) return null;
  return (
    <section className='space-y-2'>
      <h3 className='text-muted-foreground text-[13px] font-semibold'>
        {HELM_COPY.researchComparisonLabel}
      </h3>
      <div className='border-border max-w-full overflow-x-auto rounded-[10px] border'>
        <table className='w-full min-w-max border-collapse text-left text-[13px] leading-[18px]'>
          {comparison.columns.length > 0 && (
            <thead>
              <tr className='bg-muted'>
                {comparison.columns.map((column, index) => (
                  <th
                    key={`${column}-${index}`}
                    scope='col'
                    className='max-w-[180px] px-3 py-2 align-top font-semibold break-words'
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className='divide-border divide-y'>
            {comparison.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th
                      key={cellIndex}
                      scope='row'
                      className='max-w-[180px] px-3 py-2 align-top font-semibold break-words'
                    >
                      {cell}
                    </th>
                  ) : (
                    <td
                      key={cellIndex}
                      className='max-w-[180px] px-3 py-2 align-top break-words'
                    >
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** What a look into something found: the summary, its sections, a comparison and its sources, always labelled as not from the person's records. */
function ResearchSheet({
  research,
  onClose,
  extra,
  footer,
  emptyText,
}: ResearchSheetProps) {
  const overview = research?.overview ?? null;
  const isLearn = research?.mode === 'learnLater';
  const isSteps = overview?.form === 'steps';
  const List = isSteps ? 'ol' : 'ul';
  return (
    <DetailSheet
      isOpen={research !== null}
      onClose={onClose}
      footer={footer}
      title={
        research
          ? research.subject.charAt(0).toUpperCase() + research.subject.slice(1)
          : ''
      }
    >
      {research && (
        <div className='space-y-4'>
          {isLearn ? (
            <p className='text-muted-foreground text-[13px] leading-[18px] text-pretty'>
              {research.isWithoutWeb
                ? HELM_COPY.learnCautionGeneral
                : HELM_COPY.learnCaution}
            </p>
          ) : (
            <div className='space-y-2'>
              <SectionDivider label={HELM_COPY.answerNotFromRecords} />
              {research.isWithoutWeb && (
                <SectionDivider label={HELM_COPY.researchNotFromWeb} />
              )}
            </div>
          )}
          {overview === null ? (
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {emptyText ?? HELM_COPY.researchNothingToShow}
            </p>
          ) : (
            <>
              {overview.summary && (
                <p className='text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
                  {overview.summary}
                </p>
              )}
              {overview.sections.map((section, index) => (
                <section
                  key={`${section.heading}-${index}`}
                  className='space-y-1.5'
                >
                  {section.heading && (
                    <h3 className='text-[15px] font-semibold break-words'>
                      {section.heading}
                    </h3>
                  )}
                  <List
                    className={`${isSteps ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 text-[15px] leading-[21px]`}
                  >
                    {section.points.map((point, pointIndex) => (
                      <li key={pointIndex} className='break-words'>
                        {point}
                      </li>
                    ))}
                  </List>
                </section>
              ))}
              <Comparison comparison={overview.comparison} />
            </>
          )}
          {extra}
          {research.sources.length > 0 && (
            <section className='space-y-2'>
              <h3 className='text-muted-foreground text-[13px] font-semibold'>
                {HELM_COPY.researchSources}
              </h3>
              <ul className='divide-border divide-y'>
                {research.sources.map((source, index) => (
                  <li
                    key={`${source.url}-${index}`}
                    className='flex min-w-0 flex-col py-2'
                  >
                    <ExternalLinkText href={source.url} label={source.title} />
                    {source.site && (
                      <span className='text-muted-foreground text-[13px] break-words'>
                        {source.site}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default ResearchSheet;

import { useState } from 'react';

import { Plus } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import { useAppSelector } from '@/store';
import { toComparable } from '@/utils/optionMatchUtils';
import AnswerField from '@apps/helm/components/home/AnswerField';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import {
  ChoiceGroup,
  ChoiceRow,
} from '@apps/helm/components/home/ChoiceButton';
import { HELM_COPY } from '@apps/helm/constants';

const RESULTS = 6;
const NEW_NAME_MAX = 80;

interface Candidate {
  ref: { collection: 'who' | 'places'; id: string };
  name: string;
  detail: string | null;
  aliases: string[];
}

/** The person's own people and places, by what the question allows: the ones it listed first, a search over the rest, then a quiet "new" that opens a name field. */
function PickRecordAnswer({ question, isBusy, onAnswer }: AnswerPartProps) {
  const [query, setQuery] = useState('');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const who = useAppSelector((state) => state.helm.who.items);
  const places = useAppSelector((state) => state.helm.places.items);
  const isPlace = question.recordKinds[0] === 'place';
  const candidates: Candidate[] = [
    ...(question.recordKinds.includes('who')
      ? who
          .filter((entry) => !entry.isUnreadable)
          .map((entry) => ({
            ref: { collection: 'who' as const, id: entry.id },
            name: entry.name,
            detail: entry.relation,
            aliases: entry.aliases,
          }))
      : []),
    ...(question.recordKinds.includes('place')
      ? places
          .filter((entry) => !entry.isUnreadable)
          .map((entry) => ({
            ref: { collection: 'places' as const, id: entry.id },
            name: entry.name,
            detail: entry.address,
            aliases: entry.aliases,
          }))
      : []),
  ];
  const wanted = toComparable(query);
  const listed: Candidate[] = question.options.flatMap((option) =>
    option.ref?.collection === 'who' || option.ref?.collection === 'places'
      ? [
          {
            ref: option.ref,
            name: option.label,
            detail: option.detail,
            aliases: [],
          },
        ]
      : [],
  );
  const shown: Candidate[] =
    wanted === ''
      ? listed
      : candidates
          .filter((entry) =>
            [entry.name, ...entry.aliases]
              .map((name) => toComparable(name))
              .some((name) => name.includes(wanted)),
          )
          .slice(0, RESULTS);
  const newOption = question.options.find((option) => option.id === 'new');

  return (
    <>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={HELM_COPY.questionRecordSearch(question.recordKinds)}
      />
      {wanted !== '' && shown.length === 0 && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.questionRecordNone}
        </p>
      )}
      {(shown.length > 0 || newOption) && (
        <ChoiceGroup label={question.prompt} kind='radio'>
          {shown.map((entry) => {
            const key = `${entry.ref.collection}:${entry.ref.id}`;
            return (
              <ChoiceRow
                key={key}
                kind='radio'
                label={entry.name}
                detail={entry.detail}
                isSelected={isBusy && chosenKey === key}
                isDisabled={isBusy}
                onClick={() => {
                  setChosenKey(key);
                  onAnswer(
                    { shape: 'pickRecord', ref: entry.ref, newName: null },
                    entry.name,
                  );
                }}
              />
            );
          })}
          {newOption && (
            <ChoiceRow
              kind='radio'
              label={newOption.label}
              icon={
                <Plus
                  className='text-muted-foreground size-5 shrink-0'
                  aria-hidden='true'
                />
              }
              isSelected={isNewOpen}
              isDisabled={isBusy}
              onClick={() => setIsNewOpen((isOpen) => !isOpen)}
            />
          )}
          {isNewOpen && (
            <div className='p-3.5'>
              <AnswerField
                label={HELM_COPY.questionNewNameField(isPlace)}
                placeholder={HELM_COPY.questionNewNameField(isPlace)}
                value={newName}
                onChange={setNewName}
                maxLength={NEW_NAME_MAX}
                isDisabled={isBusy}
                autoFocus
                onSend={() =>
                  onAnswer({
                    shape: 'pickRecord',
                    ref: null,
                    newName: newName.trim(),
                  })
                }
              />
            </div>
          )}
        </ChoiceGroup>
      )}
    </>
  );
}

export default PickRecordAnswer;

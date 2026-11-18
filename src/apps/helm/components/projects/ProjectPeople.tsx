import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, UserPlus } from 'lucide-react';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import ProjectAddSheet from '@apps/helm/components/projects/ProjectAddSheet';
import ProjectRoleSheet from '@apps/helm/components/projects/ProjectRoleSheet';
import WhoPhoto from '@apps/helm/components/who/WhoPhoto';
import { HELM_COPY } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  changeProjectRole,
  type RoleChange,
} from '@apps/helm/store/actions/projectActions';
import { selectWhoById } from '@apps/helm/store/selectors/whoSelectors';
import type { OpenProject, OpenWho, ProjectRole } from '@apps/helm/types';

interface ProjectPeopleProps {
  project: OpenProject;
  isReadOnly: boolean;
  onOpenWho: (whoId: string) => void;
}

export type ApplyRole = (
  target: { whoId: string } | { newName: string },
  change: RoleChange,
  title: string,
) => Promise<boolean>;

const ROLE_ORDER: ProjectRole[] = ['key', 'involved', 'mentioned'];

interface PersonRowProps {
  who: OpenWho;
  role: ProjectRole;
  note: string | null;
  onOpen: (whoId: string) => void;
}

function PersonRow({ who, role, note, onOpen }: PersonRowProps) {
  const line = [
    role === 'key'
      ? HELM_COPY.projectKeyPerson
      : role === 'involved'
        ? HELM_COPY.projectInvolvedPerson
        : null,
    note,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(who.id)}
    >
      <WhoPhoto kind={who.kind} name={who.name} mediaId={who.photoMediaId} />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {who.name}
        </span>
        {line && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {line}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

/** The people on a project: key people, then the involved, then the ones only mentioned, folded behind a count. A row opens a small sheet to change the part. */
function ProjectPeople({ project, isReadOnly, onOpenWho }: ProjectPeopleProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const whoById = useAppSelector(selectWhoById);
  const [isMentionedOpen, setIsMentionedOpen] = useState(false);
  const [openWhoId, setOpenWhoId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const people = ROLE_ORDER.map((role) => ({
    role,
    list: Object.entries(project.whoRoles)
      .flatMap(([id, assigned]) => {
        const who = whoById.get(id);
        return assigned === role && who && !who.isUnreadable ? [who] : [];
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
  }));
  const [key, involved, mentioned] = people;
  const openWho = openWhoId ? (whoById.get(openWhoId) ?? null) : null;

  const apply: ApplyRole = async (target, change, title) => {
    if (!user) return false;
    try {
      const result = await changeProjectRole(
        user.uid,
        await getHelmEncryption(user.uid),
        project.id,
        target,
        change,
      );
      if (result.kind !== 'saved') {
        addToast({
          title:
            result.kind === 'offline'
              ? HELM_COPY.editNeedsConnection
              : result.kind === 'missing'
                ? HELM_COPY.projectGone
                : HELM_COPY.projectUnreadable,
          type: 'info',
        });
        return false;
      }
      addToast({
        title,
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void result.undo().catch((error: unknown) => {
              console.error('Helm project role was not put back', error);
              addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
            }),
        },
      });
      return true;
    } catch (error) {
      console.error('Helm project role was not saved', error);
      addToast({ title: HELM_COPY.projectRoleFailed, type: 'error' });
      return false;
    }
  };

  const renderGroup = (heading: string | null, list: OpenWho[]) =>
    list.length > 0 && (
      <section className='space-y-2'>
        {heading && (
          <h2 className='text-muted-foreground text-[13px] font-medium'>
            {heading}
          </h2>
        )}
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {list.map((who) => (
            <li key={who.id}>
              <PersonRow
                who={who}
                role={project.whoRoles[who.id]}
                note={project.roleNotes[who.id] ?? null}
                onOpen={isReadOnly ? onOpenWho : setOpenWhoId}
              />
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className='space-y-4'>
      {key.list.length + involved.list.length + mentioned.list.length === 0 && (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {HELM_COPY.projectPeopleEmpty}
        </p>
      )}
      {renderGroup(HELM_COPY.projectKeyHeading, key.list)}
      {renderGroup(HELM_COPY.projectInvolvedHeading, involved.list)}
      {mentioned.list.length > 0 && (
        <section className='space-y-2'>
          <ShowMoreButton
            isOpen={isMentionedOpen}
            onClick={() => setIsMentionedOpen((isOpen) => !isOpen)}
          >
            {isMentionedOpen
              ? HELM_COPY.projectMentionedHide
              : HELM_COPY.projectMentionedFold(mentioned.list.length)}
          </ShowMoreButton>
          {isMentionedOpen && renderGroup(null, mentioned.list)}
        </section>
      )}
      {!isReadOnly && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => setIsAdding(true)}
        >
          <UserPlus className='size-4' aria-hidden='true' />
          {HELM_COPY.projectAddSomeone}
        </Button>
      )}
      {openWho && (
        <ProjectRoleSheet
          project={project}
          who={openWho}
          onClose={() => setOpenWhoId(null)}
          onApply={apply}
          onOpenWho={onOpenWho}
        />
      )}
      <ProjectAddSheet
        isOpen={isAdding}
        project={project}
        onClose={() => setIsAdding(false)}
        onApply={apply}
      />
    </div>
  );
}

export default ProjectPeople;

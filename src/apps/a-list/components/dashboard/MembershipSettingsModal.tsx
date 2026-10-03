import { Modal } from '@moondreamsdev/dreamer-ui/components';

import { formatDateUTC } from '@/utils/formatUtils';
import type { MembershipProfile } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';
import { formatTaxRate } from '@apps/a-list/utils/tax';

interface MembershipSettingsModalProps {
  isOpen: boolean;
  membership: MembershipProfile;
  onClose: () => void;
}

function MembershipSettingsModal({
  isOpen,
  membership,
  onClose,
}: MembershipSettingsModalProps) {
  const rows = [
    {
      label: 'Monthly cost before tax',
      value: formatCents(membership.monthlyCostCents),
    },
    {
      label: 'Monthly total with tax',
      value:
        membership.taxRate === null
          ? `${formatCents(membership.monthlyTotalCents)} · no bill total added`
          : `${formatCents(membership.monthlyTotalCents)} · about ${formatTaxRate(membership.taxRate)} tax`,
    },
    { label: 'Started', value: formatDateUTC(membership.startDate) },
    {
      label: 'Weekly goal',
      value:
        membership.weeklyGoal === null
          ? 'No goal'
          : `${membership.weeklyGoal} a week`,
    },
    {
      label: 'Monthly goal',
      value:
        membership.monthlyGoal === null
          ? 'No goal'
          : `${membership.monthlyGoal} a month`,
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Membership'>
      <dl className='divide-border divide-y text-sm'>
        {rows.map((row) => (
          <div
            key={row.label}
            className='flex items-center justify-between gap-4 py-2.5'
          >
            <dt className='text-muted-foreground'>{row.label}</dt>
            <dd className='text-right font-medium'>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export default MembershipSettingsModal;

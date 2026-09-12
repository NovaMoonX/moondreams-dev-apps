import { Card } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils';
import type { CatInsurance } from '@apps/nine-lives/types';

interface InsuranceCardProps {
  insurance?: CatInsurance | null;
}

function InsuranceCard({ insurance }: InsuranceCardProps) {
  if (!insurance) {
    return (
      <Card className='border-dashed bg-card text-sm text-muted-foreground'>
        Insurance not on file.
      </Card>
    );
  }

  const monthlyPremiumLabel =
    insurance.monthlyPremium != null
      ? `Monthly premium: $${insurance.monthlyPremium.toFixed(2)}`
      : null;
  const coverageStartLabel = insurance.coverageStartDate
    ? `Coverage start: ${formatDateTime(insurance.coverageStartDate)}`
    : null;

  return (
    <Card className='bg-card' header={<h3 className='text-lg font-semibold'>{insurance.provider}</h3>}>
      <p className='text-sm text-muted-foreground'>Policy: {insurance.policyNumber}</p>
      {monthlyPremiumLabel && (
        <p className='mt-1 text-sm text-muted-foreground'>{monthlyPremiumLabel}</p>
      )}
      {coverageStartLabel && (
        <p className='mt-1 text-sm text-muted-foreground'>{coverageStartLabel}</p>
      )}
      {insurance.coverageNotes && (
        <p className='mt-2 text-sm text-foreground'>{insurance.coverageNotes}</p>
      )}
    </Card>
  );
}

export default InsuranceCard;

import type { CatInsurance } from '@apps/nine-lives/types';

interface InsuranceCardProps {
  insurance?: CatInsurance | null;
}

function InsuranceCard({ insurance }: InsuranceCardProps) {
  if (!insurance) {
    return (
      <div className='rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground'>
        Insurance not on file.
      </div>
    );
  }

  return (
    <div className='rounded-lg border border-border bg-card p-4'>
      <h3 className='text-lg font-semibold'>{insurance.provider}</h3>
      <p className='mt-2 text-sm text-muted-foreground'>Policy: {insurance.policyNumber}</p>
      {insurance.monthlyPremium !== undefined && (
        <p className='mt-1 text-sm text-muted-foreground'>
          Monthly premium: ${insurance.monthlyPremium.toFixed(2)}
        </p>
      )}
      {insurance.coverageStartDate && (
        <p className='mt-1 text-sm text-muted-foreground'>
          Coverage start: {new Date(insurance.coverageStartDate).toLocaleDateString()}
        </p>
      )}
      {insurance.coverageNotes && (
        <p className='mt-2 text-sm text-foreground'>{insurance.coverageNotes}</p>
      )}
    </div>
  );
}

export default InsuranceCard;

import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useUserInfo } from '@/hooks/useUserInfo';
import { isValidEmail, normalizeEmail } from '@/utils/emailUtils';
import { MAX_CO_SELLERS } from '@apps/going-once/constants';
import { addCoSeller } from '@apps/going-once/store/actions/memberActions';
import type { Sale, SaleEmailInvite } from '@apps/going-once/types';
import { toFirstName } from '@apps/going-once/utils/personName';

const ADD_FAILED = "That didn't save. Check your connection and try again.";

interface AddCoSellerSheetProps {
  sale: Sale;
  uid: string;
  myEmail: string | null;
  /** The people already on the sale, to refuse an email that belongs to one of them. */
  memberEmails: string[];
  invites: SaleEmailInvite[];
  onClose: () => void;
}

/** Adds a co-seller by email. Nothing is sent: they open Going Once signed in with that email and the sale is waiting. */
function AddCoSellerSheet({
  sale,
  uid,
  myEmail,
  memberEmails,
  invites,
  onClose,
}: AddCoSellerSheetProps) {
  const { addToast } = useToast();
  const me = useUserInfo(uid);
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeEmail(email);
  const isFull = sale.members.length - 1 + invites.length >= MAX_CO_SELLERS;
  const problem = (() => {
    if (!isValidEmail(normalized)) return null;
    if (normalized === normalizeEmail(myEmail ?? ''))
      return "That's your own email.";
    if (memberEmails.some((member) => normalizeEmail(member) === normalized))
      return 'They are already on this sale.';
    if (invites.some((invite) => invite.email === normalized))
      return 'They are already waiting to join.';
    if (isFull) return `A sale has room for ${MAX_CO_SELLERS} co-sellers.`;
    return null;
  })();
  const canAdd = isValidEmail(normalized) && problem === null && !isSaving;

  const add = async () => {
    if (!canAdd) return;
    setIsSaving(true);
    setError(null);
    try {
      await addCoSeller(sale, uid, toFirstName(me?.displayName), normalized);
      addToast({
        title: `Added ${normalized}`,
        description:
          'They join when they open Going Once signed in with that email.',
        type: 'success',
      });
      onClose();
    } catch {
      setIsSaving(false);
      setError(ADD_FAILED);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Add co-seller'>
      <form
        className='space-y-3 pb-4'
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input
          type='email'
          variant='outline'
          aria-label='Email address'
          placeholder='name@example.com'
          autoFocus
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
        />
        <p className='text-muted-foreground text-sm'>
          Nothing is sent. When they open Going Once signed in with this email,
          {` ${sale.name} `}is waiting for them, floor prices and notes
          included.
        </p>
        {(problem ?? error) && (
          <p role='alert' className='text-destructive text-sm'>
            {problem ?? error}
          </p>
        )}
      </form>
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={!canAdd}
            onClick={() => void add()}
          >
            Add
          </Button>
        }
      />
    </FormSheet>
  );
}

export default AddCoSellerSheet;

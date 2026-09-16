import { DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';

import { copyToClipboard } from '@/utils/clipboardUtils';

import type { VetClinic } from '../types';

const { option } = DropdownMenuFactories;

/** Contact-only menu items for a clinic (call/email/copy) — shared by the clinics list and anywhere else a visit's clinic needs to be actionable. */
export function getClinicContactMenuItems(clinic: VetClinic) {
  return [
    ...(clinic.phone
      ? [
          option({ label: 'Call clinic', value: 'call-clinic', description: clinic.phone }),
          option({ label: 'Copy phone', value: 'copy-phone', description: 'Copy the clinic phone number.' }),
        ]
      : []),
    ...(clinic.email
      ? [
          option({ label: 'Email clinic', value: 'email-clinic', description: clinic.email }),
          option({ label: 'Copy email', value: 'copy-email', description: 'Copy the clinic email address.' }),
        ]
      : []),
    ...(clinic.address
      ? [option({ label: 'Copy address', value: 'copy-address', description: 'Copy the clinic address.' })]
      : []),
  ];
}

/** Handles a contact menu item's value. Returns whether it handled the value, so a caller with its own extra menu items can fall through to its own handling. */
export async function handleClinicContactAction(
  value: string,
  clinic: VetClinic,
  addToast: (toast: { title: string; description: string }) => void,
): Promise<boolean> {
  if (value === 'call-clinic' && clinic.phone) {
    window.location.href = `tel:${clinic.phone.replace(/[^+\d]/g, '')}`;
    return true;
  }

  if (value === 'email-clinic' && clinic.email) {
    window.location.href = `mailto:${clinic.email}`;
    return true;
  }

  if (value === 'copy-phone' && clinic.phone) {
    const copied = await copyToClipboard(clinic.phone);
    if (copied) {
      addToast({ title: 'Phone copied', description: 'Clinic phone number copied to your clipboard.' });
    }
    return true;
  }

  if (value === 'copy-email' && clinic.email) {
    const copied = await copyToClipboard(clinic.email);
    if (copied) {
      addToast({ title: 'Email copied', description: 'Clinic email address copied to your clipboard.' });
    }
    return true;
  }

  if (value === 'copy-address' && clinic.address) {
    const copied = await copyToClipboard(clinic.address);
    if (copied) {
      addToast({ title: 'Address copied', description: 'Clinic address copied to your clipboard.' });
    }
    return true;
  }

  return false;
}

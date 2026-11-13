import {
  FileText,
  Image as ImageIcon,
  Mic,
  type LucideIcon,
} from 'lucide-react';

import type { MediaKind } from '@apps/helm/types';

const ICON: Record<MediaKind, LucideIcon> = {
  photo: ImageIcon,
  pdf: FileText,
  markdown: FileText,
  voiceNote: Mic,
};

/** The icon that stands for a kind of medium. */
export function MediaKindIcon({
  kind,
  className,
}: {
  kind: MediaKind;
  className: string;
}) {
  const Icon = ICON[kind];
  return <Icon className={className} aria-hidden='true' />;
}

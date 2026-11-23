import type { AmcFormat, MovieSnapshot } from '../types.js';

// Copies of the app's own types: this package can't import from the client.

export interface Ticket {
  entryMode: 'ITEMIZED' | 'ALL_IN';
  format: AmcFormat;
  priceCents: number;
  standardPriceCents: number | null;
  feeAvoidedCents: number;
  taxRate: number | null;
  taxCents: number;
  taxChoice: 'AMC' | 'USUAL' | null;
  totalCents: number;
}

export interface TheatreSnapshot {
  theatreId: string;
  name: string;
  city: string | null;
  state: string | null;
  timeZone: string | null;
}

export interface Viewing {
  id: string;
  movieKey: string;
  movie: MovieSnapshot;
  showtimeAt: number;
  endsAt: number;
  status: 'PLANNED' | 'SEEN';
  ticket: Ticket | null;
  theatre: TheatreSnapshot | null;
  purchase: Record<string, unknown> | null;
  rating: number | null;
  trailerReminderId: string | null;
  amcConfirmation: string | null;
  emailEventId: string | null;
  createdAt: number;
  lastEditedAt: number;
}

export type EmailOutcome =
  | 'added'
  | 'attached'
  | 'canceled'
  | 'partlyCanceled'
  | 'cancelNotFound'
  | 'alreadyHandled'
  | 'confirm'
  | 'notTicket'
  | 'unread';

export interface EmailEvent {
  id: string;
  receivedAt: number;
  outcome: EmailOutcome;
  from: string;
  subject: string;
  snippet: string;
  readBy: 'pattern' | 'ai' | null;
  viewingId: string | null;
  movieTitle: string | null;
  showtimeAt: number | null;
  theatreName: string | null;
  confirmation: string | null;
  ticketCount: number | null;
  removedViewing: Viewing | null;
  priorViewing: Viewing | null;
  watchlistKey: string | null;
  undoneAt: number | null;
}

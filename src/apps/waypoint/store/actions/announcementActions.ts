import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, runTransaction, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { Announcement, AnnouncementSeverity, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

interface CreateAnnouncementInput {
  uid: string;
  trip: TripSpace;
  severity: AnnouncementSeverity;
  title: string;
  body: string;
  expiresAt: number | null;
}

export const createAnnouncement = createAsyncThunk<
  Announcement,
  CreateAnnouncementInput,
  { rejectValue: string }
>(
  'waypoint/announcements/create',
  async ({ uid, trip, severity, title, body, expiresAt }, { rejectWithValue }) => {
    if (!isTripAdmin(trip, uid)) {
      return rejectWithValue('Only trip admins can post announcements.');
    }
    if (!title.trim() || !body.trim()) {
      return rejectWithValue('Enter a title and message for this announcement.');
    }

    const announcementRef = doc(
      collection(db, 'apps', 'waypoint', 'trips', trip.id, 'announcements'),
    );
    const announcement: Announcement = {
      id: announcementRef.id,
      tripId: trip.id,
      severity,
      title: title.trim(),
      body: body.trim(),
      expiresAt,
      dismissedBy: {},
      createdBy: uid,
      createdAt: Date.now(),
    };

    await setDoc(announcementRef, announcement);
    return announcement;
  },
);

interface DeleteAnnouncementInput {
  uid: string;
  trip: TripSpace;
  announcementId: string;
}

export const deleteAnnouncement = createAsyncThunk<
  void,
  DeleteAnnouncementInput,
  { rejectValue: string }
>(
  'waypoint/announcements/delete',
  async ({ uid, trip, announcementId }, { rejectWithValue }) => {
    if (!isTripAdmin(trip, uid)) {
      return rejectWithValue('Only trip admins can remove announcements.');
    }

    await deleteDoc(
      doc(db, 'apps', 'waypoint', 'trips', trip.id, 'announcements', announcementId),
    );
  },
);

interface DismissAnnouncementInput {
  uid: string;
  trip: TripSpace;
  announcementId: string;
}

// Written by every trip member independently (each to their own key), so — like
// markEventSeen — this reads and writes inside a transaction rather than a plain updateDoc.
export const dismissAnnouncement = createAsyncThunk<
  void,
  DismissAnnouncementInput,
  { rejectValue: string }
>('waypoint/announcements/dismiss', async ({ uid, trip, announcementId }) => {
  const announcementRef = doc(
    db,
    'apps',
    'waypoint',
    'trips',
    trip.id,
    'announcements',
    announcementId,
  );
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(announcementRef);
    if (!snapshot.exists()) {
      return;
    }
    const dismissedBy = (snapshot.data().dismissedBy ?? {}) as Record<string, number>;
    transaction.update(announcementRef, { dismissedBy: { ...dismissedBy, [uid]: Date.now() } });
  });
});

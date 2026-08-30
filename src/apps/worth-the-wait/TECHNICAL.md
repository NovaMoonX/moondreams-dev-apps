# **Technical Architecture: Worth the Wait**

> **Global Data Keying**: All application data must be namespaced under the mini-app identifier worth-the-wait (e.g., Firestore root path /apps/worth-the-wait/spaces/{spaceId}).

## **Space Entry, Auth & Pairing Mechanics**

Primary user authentication and display names are managed globally by the host application shell and passed down to the mini-app.

When a user opens Worth the Wait without an active space, they are presented with an onboarding choice to either **Create a Space** or **Join a Space**.

                       [ First Time Entry ]  
                                │  
               ┌────────────────┴────────────────┐  
               ▼                                 ▼  
      [ Create Space ]                    [ Join Space ]  
      ├─ Sets createdBy = uid             ├─ Submits inviteCode  
      └─ Generates inviteCode             └─ Sets State: Pending Approval  
               │                                 │  
               └────────────────┬────────────────┘  
                                ▼  
                    [ User A Approves User B ]  
                                │  
                                ▼  
                   [ Space Locked: 2 Members ]

### **Onboarding & Pairing Steps**

1. **Option Selection:**
   * **Create Space:** User A creates a space. User A becomes member #1 (createdBy = uidA), member array is initialized (members = [uidA]), and an inviteCode is generated. A lightweight lookup doc is also written at `apps/worth-the-wait/inviteCodes/{code}` with the matching `spaceId`.
   * **Join Space:** User B enters an inviteCode. The app reads `apps/worth-the-wait/inviteCodes/{code}` to resolve the `spaceId`, then submits a join request by writing `pendingMember` on that space.
2. **Approval Step:** User A receives an in-app prompt to accept or decline User B's join request.  
3. **Space Lock:** Upon approval, User B is added to members (members.length == 2), pendingMember is cleared, the `inviteCodes/{code}` lookup is removed, inviteCode is invalidated, and no further users may join.

## **Data Schema**

### **apps/worth-the-wait/spaces/{spaceId}**

Represents the shared environment between the two partners.

| Field | Type | Description |
| :---- | :---- | :---- |
| id | string | Unique space document ID |
| createdBy | string | UID of the space creator (User A) |
| createdAt | timestamp | Timestamp when space was created |
| members | array<string> | Array of active member UIDs ([uidA, uidB]) |
| inviteCode | string | null | Short string for partner pairing (cleared once locked) |
| pendingMember | map | null | Pending request ({ uid: string, requestedAt: timestamp }) |
| activeAction | map | null | Currently active synchronous action state (Full Reveal or Raffle) |
| encryption | map | null | Per-space AES-256-GCM key bundle with `keyId`, `keyVersion`, and the raw secret key for the active member set |

### **apps/worth-the-wait/inviteCodes/{code}**

Lightweight invite lookup used before a user is approved into a private space.

| Field | Type | Description |
| :---- | :---- | :---- |
| spaceId | string | Target private space document ID |

### **apps/worth-the-wait/spaces/{spaceId}/boxes/{boxId}**

Represents a collection box (default or custom).

| Field | Type | Description |
| :---- | :---- | :---- |
| id | string | Unique box document ID |
| name | string | Display name of the box |
| emoji | string | Single emoji icon |
| description | string | Short description (max 80 chars) |
| isDefault | boolean | true for pre-seeded boxes, false for custom |
| createdBy | string | UID of creator ("system" for default boxes) |
| revealRequestedBy | array<map> | Active reveal requests ([{ userId, method, requestedAt }]) |
| revealHistory | array<map> | Log of past reveals/raffles (see schema below) |
| createdAt | timestamp | Box creation timestamp |
| lastEditedAt | timestamp | Timestamp when box details were last modified |

#### **revealRequestedBy Array Element Map**

Tracks pending reveal or raffle requests. Each user may have at most one active request entry, which they can undo/cancel at any time prior to execution.

| Field | Type | Description |
| :---- | :---- | :---- |
| userId | string | UID of the requesting member |
| method | string (enum) | Requested action: "full_reveal" | "raffle" |
| requestedAt | timestamp | Timestamp when the request was placed |

#### **revealHistory Array Element Map**

Tracks each completed reveal event (raffle or full box reveal) for auditing and UI indicators.

| Field | Type | Description |
| :---- | :---- | :---- |
| id | string | Unique reveal event ID |
| method | string (enum) | "full_reveal" | "raffle" | "user_reveal" |
| triggeredBy | string | UID of user who clicked the explicit trigger button |
| revealedAt | timestamp | Server timestamp when the reveal occurred |
| itemIds | array<string> | Array of item IDs revealed during this event |

### **apps/worth-the-wait/spaces/{spaceId}/boxes/{boxId}/items/{itemId}**

Subcollection containing user-submitted items within a box.

| Field | Type | Description |
| :---- | :---- | :---- |
| id | string | Unique item document ID |
| authorId | string | UID of the item creator |
| content | string | Plain text item body |
| isRevealed | boolean | Flag indicating if item is visible to both partners |
| revealedAt | timestamp | null | Timestamp when the item was revealed |
| revealedMethod | string (enum) | null | Method used: "full_reveal" | "raffle" | "user_reveal" | null |
| createdAt | timestamp | Item creation timestamp |
| lastEditedAt | timestamp | Timestamp when item content was last edited |

### **activeAction Schema Map (on spaces/{spaceId})**

Tracks synchronized animations/modals across both partner devices during active raffles or full box reveals. Locks duplicate triggers.

| Field | Type | Description |
| :---- | :---- | :---- |
| actionId | string | Session identifier for current action run |
| boxId | string | Target box ID where action is occurring |
| method | string (enum) | "full_reveal" | "raffle" |
| status | string (enum) | "initiating" | "executing" | "completed" |
| selectedItemIds | array<string> | Item ID(s) revealed during this session |
| initiatedBy | string | UID of user who pressed the trigger button |
| startedAt | timestamp | Server timestamp when action began |
| completedAt | timestamp | null | Timestamp when action completed |

## **Private Content Encryption Contract**

Worth the Wait encrypts only the sensitive user-authored text that should stay private between the two active members. The payload contract is shared by the app and seed fixtures:

- `spaces/{spaceId}.encryption = { appId, keyId, keyVersion, key }`
- Each encrypted field stores a ciphertext plus `nonce`, `algorithm`, and the matching `keyId`/`keyVersion` metadata.
- Sensitive fields include `boxes/{boxId}.name`, `boxes/{boxId}.description`, `boxes/{boxId}.emoji`, and `boxes/{boxId}/items/{itemId}.content`.
- Metadata fields such as `createdBy`, `createdAt`, `isDefault`, `revealRequestedBy`, and `revealHistory` remain unencrypted so queries, reveal logic, and access control still work reliably.
- Decryption is only performed when an authenticated user is a current member of the space; non-members cannot read the key or the encrypted payload contract.

## **Realtime Presence & Synchronous Workflows**

Presence tracking is managed centrally by the host application via the Realtime Database path status/{uid}:

{  
  "state": "online",  
  "currentLocation": "worth-the-wait",  
  "lastChanges": 1786880000000  
}

Both **Full Box Reveals** and **Raffles** require both partners to fulfill two presence criteria before an action can be triggered:

1. status/{uid}.state === 'online'  
2. status/{uid}.currentLocation === 'worth-the-wait'

### **Action Lifecycle & Dual-Trigger Prevention**

To prevent race conditions (e.g., both partners clicking trigger simultaneously, or a user refreshing and clicking again), activeAction acts as an atomic execution lock.

       [ Both Users Request Same Action ]  
                       │  
                       ▼  
          [ Presence & Location Validated ]  
                       │  
                       ▼  
          [ Primary Trigger Button Enabled ]  
                       │  
                       ▼  
       [ Partner A Clicks "Start Action" ]  
                       │  
                       ▼  
       [ Transaction Check: activeAction ]  
       ├─ If activeAction exists & status != 'completed' ──▶ ABORT (Lock Active)  
       └─ If null or status == 'completed' ──────────────▶ LOCK ACQUIRED  
                                                                  │  
                                                                  ▼  
                                                      Set status: "initiating"  
                                                                  │  
                                                                  ▼  
                                                      Set status: "executing"  
                                                      ├─ DB writes & selection  
                                                      └─ Server delay calculation  
                                                                  │  
                                                                  ▼  
                                                      Set status: "completed"  
                                                      (Reveal complete & UI unlock)

1. **Button Disabled Conditions:**  
   * Partner offline or in a different mini-app.  
   * activeAction is non-null AND activeAction.status !== "completed" (action in progress).  
2. **Derived UI Animation State:**  
   * **Client Animation Visibility:** On the client, the UI animation/modal overlay is derived and displayed whenever activeAction exists and activeAction.status !== "completed" (i.e. status is "initiating" or "executing").  
   * **Server Delay Calculation:** During the "executing" state, after writing database updates, the Cloud Function calculates the elapsed time since startedAt. It enforces a pause (sleep) for any remaining duration needed to satisfy the method's total animation time before setting status: "completed":  
     * **Full Reveal Method Duration:** 2,500 ms total duration.  
     * **Raffle Method Duration:** 5,000 ms total duration.

## **Cloud Functions Requirements**

Execution is strictly handled via the Cloud Function callable endpoint (triggerBoxAction) to guarantee concurrency locking, server-controlled randomness, and state integrity.

### **triggerBoxAction**

* **Trigger:** Callable function invoked when a user clicks the enabled primary trigger button in RevealAction.tsx.  
* **Payload:** { spaceId: string, boxId: string, method: "full_reveal" | "raffle" }  
* **Execution Steps:**  
  1. **Atomic Lock & Dual-Trigger Guard:**  
     * Runs within a database transaction reading spaces/{spaceId}.activeAction.  
     * If activeAction != null AND activeAction.status !== "completed", aborts immediately with error code already-in-progress.  
     * Immediately writes spaces/{spaceId}.activeAction = { actionId, boxId, method, status: "initiating", selectedItemIds: [], initiatedBy: context.auth.uid, startedAt: serverTimestamp(), completedAt: null }.  
  2. **Matching Method Verification:**  
     * Asserts that both space members have matching entries in boxes/{boxId}.revealRequestedBy matching payload.method.  
  3. **Active Presence & Location Verification:**  
     * Reads RTDB paths status/{uid} for both space members. Asserts that both users have state == "online" AND currentLocation == "worth-the-wait". If either condition fails, resets activeAction = null and aborts with informative error.  
  4. **Execution Phase (status: "executing"):**  
     * Updates activeAction.status = "executing".  
     * **If method == "full_reveal":**  
       1. Queries all unrevealed items (isRevealed == false) in the target box.  
       2. Batch updates all unrevealed items: isRevealed = true, revealedAt = serverTimestamp(), revealedMethod = "full_reveal".  
       3. Sets selectedItemIds with all newly revealed item IDs.  
     * **If method == "raffle":**  
       1. Queries all unrevealed items (isRevealed == false) in the target box.  
       2. Uses cryptographically secure server randomness to select a single winning itemId.  
       3. Updates the winning item: isRevealed = true, revealedAt = serverTimestamp(), revealedMethod = "raffle".  
       4. Sets selectedItemIds containing the single winning item ID.  
  5. **Server Delay Calculation & Synchronized Timing:**  
     * Calculates elapsed time since startedAt.  
     * Pauses (sleep) for the remaining duration required to reach the target animation time (2,500 ms for full_reveal, 5,000 ms for raffle).  
  6. **Completion Phase (status: "completed"):**  
     * Appends entry to boxes/{boxId}.revealHistory: { id, method, triggeredBy: context.auth.uid, revealedAt: serverTimestamp(), itemIds: selectedItemIds }.  
     * Resets boxes/{boxId}.revealRequestedBy = [].  
     * Updates spaces/{spaceId}.activeAction setting status: "completed" and completedAt = serverTimestamp().

## **Security & Privacy Requirements**

* **App Namespacing:** All database transactions and security rules are restricted to paths prefixed with apps/worth-the-wait/.
* **Space Membership Guard:** Reads of `spaces/{spaceId}` and all space subresources are restricted strictly to authenticated users listed in `members`.
* **Invite Lookup Privacy:** `inviteCodes/{code}` can be read by authenticated users because it only exposes a `spaceId` mapping and no private space payload.
* **Join Approval Security:** Pending users can write a join request to `pendingMember` during initial pairing, but cannot read the space, boxes, or items until accepted into `members`.
* **Item Privacy (Unrevealed State):** Unrevealed items (isRevealed == false) created by a partner remain strictly unqueryable and unreadable by the non-author until flipped to isRevealed == true via Cloud Functions.
* **Author Integrity:** Users may only write, edit, or delete items where authorId matches their authenticated UID.

## **Component & File Architecture**

```
src/  
└── apps/  
    └── worth-the-wait/  
        ├── components/  
        │   ├── ActionAnimationModal.tsx # Synchronized raffle/reveal animation overlay  
        │   ├── BoxCard.tsx              # Box display card with reveal history badge  
        │   ├── BoxDetailDrawer.tsx      # Slide-out drawer/modal for box contents  
        │   ├── BoxGrid.tsx              # Grid layout for default and custom boxes  
        │   ├── ManageBoxModal.tsx       # Modal form for custom boxes 
        │   ├── ItemCard.tsx             # Card displaying item content & revealMethod badge  
        │   ├── ItemForm.tsx             # Input form to stage/edit an item  
        │   ├── PendingApprovalModal.tsx # Prompt for Space Creator to accept/decline Member #2  
        │   ├── PresenceBadge.tsx        # Partner online & in-app indicator (reads status/{uid})  
        │   ├── RevealAction.tsx         # Mutual request selector & explicit action trigger button  
        │   └── SpaceOnboardingModal.tsx # Create space vs. Join space selector & code entry  
        ├── hooks/  
        │   ├── useActiveAction.ts       # Synchronous action state listener (initiating/executing/completed)  
        │   ├── useBoxes.ts              # Box queries, editing, and reveal history listeners  
        │   ├── useItems.ts              # Item CRUD operations within a box  
        │   ├── usePresence.ts           # Hook consuming global RTDB status/{uid} & currentLocation  
        │   └── useSpace.ts              # Active space context & join approval logic  
        ├── utils/  
        │   └── boxHelpers.ts            # Formatting and helper utilities  
        ├── WorthTheWait.tsx             # Mini-app main entry point  
        └── index.ts                     # Public exports for application router  
```
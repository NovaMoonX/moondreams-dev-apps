# **Technical Architecture: Worth the Wait**

> **Global Data Keying**: All application data must be namespaced under the mini-app identifier worth-the-wait (e.g., Firestore root path /apps/worth-the-wait/spaces/{spaceId}).

## **Space Entry, Auth & Pairing Mechanics**

While primary user authentication is handled globally by the host application, entering or creating a mini-app space requires a dedicated onboarding and approval flow. Each user belongs to **a single space** shared exclusively with their partner.

\[ User A Creates Space \]  
  ├─ Enters Display Name / Space Name  
  └─ Generates Invite Code / Link  
            │  
            ▼  
\[ User B Inputs Code \] ──▶ \[ State: Pending Approval \]  
  └─ Enters Display Name        │  
                                ▼  
                      \[ User A Approves User B \]  
                                │  
                                ▼  
                   \[ Space Locked: 2 Members \]

* **Global Auth Assumption:** The user's authenticated uid is passed down from the global app shell.  
* **Member Display Name:** Upon creating or joining a space, members must enter a display name (e.g., first name, nickname, or custom alias) that will identify them within the space.  
* **Onboarding & Pairing Flow:**  
  1. **Space Creation:** User A opens the mini-app for the first time, provides their display name/nickname, and generates a space. User A becomes member \#1 and an inviteCode is created.  
  2. **Join Request:** User B enters the mini-app, submits an inviteCode, and enters their display name/nickname. User B is stored in the space under pendingMember.  
  3. **Approval Step:** User A receives an in-app prompt to review and accept/decline User B's join request.  
  4. **Space Lock:** Upon User A's approval, User B is moved into the active members array (members.length \== 2), pendingMember is cleared, the inviteCode is invalidated, and no further users can join.

## **Data Schema**

### **apps/worth-the-wait/spaces/{spaceId}**

Represents the shared environment between the two partners.

| Field | Type | Description |
| :---- | :---- | :---- |
| id | string | Unique space document ID |
| createdAt | timestamp | Timestamp when space was created |
| lastEditedAt | timestamp | Timestamp of last modification in space |
| members | array\<string\> | Array of active member UIDs (\[uidA, uidB\]) |
| memberNames | map\<string, string\> | Map of member UIDs to display names/nicknames (e.g. { "uidA": "Alex", "uidB": "Sam" }) |
| inviteCode | string | Short string for partner pairing (cleared once space is locked) |
| pendingMember | map | null | Pending user request object ({ uid: string, displayName: string, requestedAt: timestamp }) |

### **apps/worth-the-wait/spaces/{spaceId}/boxes/{boxId}**

Represents a collection box (default or custom).

| Field | Type | Description |
| :---- | :---- | :---- |
| id | string | Unique box document ID |
| name | string | Display name of the box |
| emoji | string | Single emoji icon |
| description | string | Short description (max 50 chars) |
| isDefault | boolean | true for pre-seeded boxes, false for custom |
| createdBy | string | UID of the creator |
| isRevealed | boolean | Global visibility state (false by default) |
| revealRequestedBy | array\<string\> | Array of member UIDs who have requested to reveal |
| createdAt | timestamp | Box creation timestamp |
| revealedAt | timestamp | null | Timestamp when isRevealed became true |
| lastEditedAt | timestamp | Timestamp when box details were last modified |

### **apps/worth-the-wait/spaces/{spaceId}/boxes/{boxId}/items/{itemId}**

Subcollection containing user-submitted notes within a box.

| Field | Type | Description |
| :---- | :---- | :---- |
| id | string | Unique item document ID |
| authorId | string | UID of the creator |
| content | string | Plain text note body |
| createdAt | timestamp | Item creation timestamp |
| lastEditedAt | timestamp | Timestamp when item content was last edited |

## **Realtime Presence & Synchronous Reveal Workflow**

To preserve the intimate ritual of opening a box together, **boxes can only be revealed when both users are online at the same time**.

                       \[ State: Locked \]  
                               │  
                       User A requests reveal  
                               │  
                               ▼  
                   \[ State: Pending Partner \]  
                               │  
               User B requests reveal  
                               │  
        ┌──────────────────────┴──────────────────────┐  
        ▼                                             ▼  
Both Users Online (RTDB)                     Either User Offline  
        │                                             │  
        ▼                                             ▼  
  \[ State: Revealed \]                        Reveal Blocked / Waiting  
  ├─ isRevealed \= true                       (UI prompts user that partner   
  └─ revealedAt \= timestamp                   must be in app to open)

### **Presence Tracking (Firebase Realtime Database)**

Presence is tracked continuously in the Realtime Database at /apps/worth-the-wait/presence/{userId}:

{  
  "state": "online",  
  "lastChanged": 1786838243000  
}

### **Reveal Validation Rules**

1. **Consent Check:** Both user UIDs must exist in revealRequestedBy.  
2. **Presence Check:** The reveal action verifies both uidA and uidB have an active "state": "online" status in the Realtime Database.  
3. **Atomic Transition:** When both consent and presence conditions are met, isRevealed flips to true, and revealedAt is stamped with the server time.

## **Security & Privacy Requirements**

* **App Namespacing:** All database transactions and security rules are restricted to paths prefixed with apps/worth-the-wait/.  
* **Space Membership Guard:** Read/write permissions across all space resources are strictly restricted to authenticated users listed in members.  
* **Join Approval Security:** A pending user can only read or write to pendingMember during initial pairing and cannot read boxes or items until accepted into members by member \#1.  
* **Synchronous Reveal Guard:** Mutation rules for setting isRevealed \= true verify both partners are online.  
* **Item Privacy (Unrevealed State):** Users can create, view, edit, and delete their own submitted items inside a box at any time. Unrevealed items created by the partner are completely unreadable and unqueryable until isRevealed \== true.  
* **Item Readability (Revealed State):** Once isRevealed \== true, both members gain read permissions for all items in that box.  
* **Author Integrity:** Users may only write, edit, or delete items where authorId matches their authenticated UID.

## **Component & File Architecture**

src/  
└── apps/  
    └── worth-the-wait/  
        ├── components/  
        │   ├── BoxCard.tsx           \# Box display card with reveal & online badge  
        │   ├── BoxDetailDrawer.tsx   \# Slide-out drawer/modal for box contents  
        │   ├── BoxGrid.tsx           \# Grid layout for default and custom boxes  
        │   ├── CreateBoxModal.tsx    \# Modal form for custom boxes (50 char limit)  
        │   ├── ItemCard.tsx          \# Card displaying individual note content  
        │   ├── ItemForm.tsx          \# Input form to stage/edit a note  
        │   ├── PendingApprovalModal.tsx \# Prompt for Member \#1 to accept/decline Member \#2  
        │   ├── PresenceBadge.tsx     \# Partner online/offline indicator  
        │   ├── RevealAction.tsx      \# Mutual reveal toggle (requires partner online)  
        │   └── SpaceOnboardingModal.tsx \# Name entry, space creation, and invite code entry  
        ├── hooks/  
        │   ├── useBoxes.ts           \# Box queries, editing, and state transitions  
        │   ├── useItems.ts           \# Item CRUD operations within a box  
        │   ├── usePresence.ts        \# Realtime Database online status listener  
        │   └── useSpace.ts           \# Active space context, display names & join approval  
        ├── utils/  
        │   └── boxHelpers.ts         \# Formatting and validation utilities  
        ├── WorthTheWait.tsx          \# Mini-app main entry point  
        └── index.ts                  \# Public exports for application router  
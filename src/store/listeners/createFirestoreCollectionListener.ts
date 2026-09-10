import { onSnapshot, type DocumentData, type Query } from 'firebase/firestore';

export function createFirestoreCollectionListener<TDoc>({
  query: firestoreQuery,
  normalize,
  onData,
}: {
  query: Query<DocumentData>;
  normalize: (id: string, data: DocumentData) => TDoc | Promise<TDoc>;
  onData: (docs: TDoc[]) => void;
}): () => void {
  return onSnapshot(firestoreQuery, async (snapshot) => {
    const docs = await Promise.all(
      snapshot.docs.map((docSnapshot) =>
        normalize(docSnapshot.id, docSnapshot.data()),
      ),
    );

    onData(docs);
  });
}

/** Bill snapshots drive invoice writes, so only publish server-confirmed bills. */
export function collectionSnapshotHandler(kind, update) {
  return (snap) => {
    if (
      kind === "bills" &&
      (snap.metadata.hasPendingWrites || snap.metadata.fromCache)
    )
      return;
    update(
      kind,
      snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    );
  };
}

// ── WHAT DELETE ACTUALLY DOES, SAID OUT LOUD ────────────────────────────────
// The Delete button sits next to Open in the saved-jobs list, on a device
// operated with a thumb, in a van or on a store floor. It had no confirmation
// at all — while the app stops to ask before something as recoverable as
// reloading the default copper prices.
//
// And it is not a local delete any more. One tap now:
//   · drops the bid from this device,
//   · tombstones the cloud row, so every OTHER device drops it on next sign-in,
//   · removes the drawings from the storage bucket.
// There is no undo and no trash. The only copy that survives is whatever JSON
// backup the estimator exported himself.
//
// So the sentence has to carry the count of drawings and the fact that this
// reaches his other devices — "Delete this job?" would be true and useless.

// → the confirm text. Names the job, because a list of bids on a phone is a
// list of store numbers that look alike.
export function deleteWarning(job, { signedIn = false } = {}) {
  const name = String(job?.name || job?.data?.projName || '').trim() || 'this untitled job';
  const files = (job?.data?.uploadedFiles || []).filter(f => f?.id).length;

  const lines = [`Delete "${name}"?`, ''];

  if (files) {
    lines.push(`Its ${files} uploaded ${files === 1 ? 'file' : 'files'} ${files === 1 ? 'goes' : 'go'} with it.`);
  }
  // Only claim the cross-device reach when there is an account for it to reach.
  // Signed out, this really is one device, and saying otherwise is a scare.
  lines.push(signedIn
    ? 'This removes it from your other devices too, the next time they sign in.'
    : 'This device only — you are not signed in.');
  lines.push('');
  lines.push('This cannot be undone.');

  return lines.join('\n');
}

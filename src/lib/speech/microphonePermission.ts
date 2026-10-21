/** Whether the browser already holds the microphone permission for this site: 'granted' only when it says so, 'unknown' where it cannot tell. Never asks. */
export const readMicrophonePermission = async (): Promise<
  PermissionState | 'unknown'
> => {
  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return status.state;
  } catch {
    return 'unknown';
  }
};

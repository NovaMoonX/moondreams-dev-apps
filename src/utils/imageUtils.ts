/** Whether a picture at this address loads in a browser, as an image at least `minWidth` wide, within `timeoutMs`; a hotlinked picture is often gone or refuses to be shown elsewhere. */
export const canLoadImage = (url: string, timeoutMs: number, minWidth = 0) =>
  new Promise<boolean>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    const settle = (isLoaded: boolean) => {
      window.clearTimeout(timer);
      resolve(isLoaded);
    };
    image.referrerPolicy = 'no-referrer';
    image.onload = () => settle(image.naturalWidth >= minWidth);
    image.onerror = () => settle(false);
    image.src = url;
  });

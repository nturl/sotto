/** Both tutor exit controls clean up before returning to the previous screen. */
export function exitTutor(
  end: () => void,
  router: {
    canGoBack(): boolean;
    back(): void;
    replace(path: `/reader/${string}` | '/(tabs)/home'): void;
  },
  bookId?: string,
): void {
  end();
  if (router.canGoBack()) router.back();
  else router.replace(bookId ? `/reader/${bookId}` : '/(tabs)/home');
}

// Hinglish copy of the app shell's lazy-route pieces (Polish PL1): the shared page fallback and the
// message when a page's code cannot be downloaded. Copy never computes anything.
export const SHELL_COPY = {
  pageLoading: 'Load ho raha hai...',
  chunkError: {
    title: 'Yeh screen load nahi ho payi.',
    body: 'Internet check karo, ya app ka naya version aa gaya hai. Page dobara load karo.',
    retry: 'Dobara try karo',
  },
} as const;

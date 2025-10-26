export function unlockAudioElements(audios: (HTMLAudioElement | null)[]) {
  const arr = audios.filter(Boolean) as HTMLAudioElement[];
  arr.forEach((a) => {
    try {
      const prev = a.volume;
      a.volume = 0;
      const p = a.play();
      if (p && typeof (p as any).then === "function") {
        (p as Promise<void>)
          .then(() => {
            a.pause();
            a.currentTime = 0;
            a.volume = prev;
          })
          .catch(() => {});
      }
    } catch {}
  });
}


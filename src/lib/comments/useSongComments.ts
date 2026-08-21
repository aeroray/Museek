import { useEffect, useRef, useState } from "react";
import type { MusicInfo } from "@/types/music";
import { fetchSongComments } from "./index";
import type { CommentSort, SongComment } from "./types";

export function useSongComments(
  song: MusicInfo | null,
  sort: CommentSort,
  enabled: boolean,
) {
  const [comments, setComments] = useState<SongComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [fetched, setFetched] = useState(false);
  const songKey = song ? `${song.source}:${song.meta.songId}` : "";
  const generation = useRef(0);

  useEffect(() => {
    setComments([]);
    setTotal(0);
    setPage(1);
    setFailed(false);
    setFetched(false);
    setUnsupported(song?.source === "local");
  }, [songKey, sort, song?.source]);

  useEffect(() => {
    if (!enabled || !song) return;
    if (song.source === "local") {
      setUnsupported(true);
      setLoading(false);
      return;
    }

    const id = ++generation.current;
    const ac = new AbortController();
    const more = page > 1;
    if (more) setLoadingMore(true);
    else setLoading(true);
    setFailed(false);

    void fetchSongComments(song, sort, page, 20, ac.signal)
      .then((result) => {
        if (id !== generation.current) return;
        setUnsupported(result.unsupported === true);
        setTotal(result.total);
        setComments((prev) =>
          page === 1 ? result.comments : [...prev, ...result.comments],
        );
        setFetched(true);
      })
      .catch((err) => {
        if (ac.signal.aborted || id !== generation.current) return;
        console.error("[museek] comments failed", song.source, err);
        setFailed(true);
        setFetched(true);
      })
      .finally(() => {
        if (id !== generation.current) return;
        setLoading(false);
        setLoadingMore(false);
      });

    return () => {
      ac.abort();
    };
  }, [enabled, song, songKey, sort, page]);

  const hasMore = comments.length > 0 && comments.length < total;
  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    setPage((current) => current + 1);
  };

  return {
    comments,
    total,
    loading: loading || (enabled && !fetched && !unsupported && !failed),
    loadingMore,
    failed,
    unsupported,
    hasMore,
    loadMore,
  };
}

"use client";

import { useEffect, useState } from "react";

type Friend = { id: string; name: string | null; avatarIndex: number; level: number };

/** Fetches the current user's friends list when the component mounts. */
export function useFriends(): Friend[] {
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    fetch("/api/friends")
      .then((r) => (r.ok ? r.json() : []))
      .then(setFriends)
      .catch(() => {});
  }, []);

  return friends;
}

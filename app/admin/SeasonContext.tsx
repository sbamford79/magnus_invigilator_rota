'use client';

import { createContext } from 'react';

export type Season = {
  id: string;
  name: string;
  status: 'active' | 'archived';
};

export const SeasonContext = createContext<{
  currentSeason: Season | null;
}>({
  currentSeason: null,
});
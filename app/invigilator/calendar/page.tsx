'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type ShiftItem = {
  id: string;
  date: string;
  label: string;
  session: string;
};

function parseLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(date: Date) {
  const y = date.getFullYear();
  const
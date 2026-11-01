import type React from 'react';

export type ScreenRoute = {
  path: string;
  element: React.ReactNode;
  chrome: 'bare' | 'app';
  auth: 'none' | 'required';
  children?: { path: string; element: React.ReactNode }[];
};

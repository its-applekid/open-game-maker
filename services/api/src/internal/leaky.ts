// Anything token- or email-shaped never leaves in a bundle or a workspace file name.
export const LEAKY =
  /(?<![A-Za-z0-9])(aiur_|ghp_|gho_|github_pat_|sk-|whsec_)[A-Za-z0-9_-]{4,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

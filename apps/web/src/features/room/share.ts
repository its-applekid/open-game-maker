export type ShareResult = { method: 'share' | 'copy' };

type ShareNavigator = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  clipboard: Pick<Clipboard, 'writeText'>;
};

export async function shareInvite(url: string, target: ShareNavigator = navigator): Promise<ShareResult> {
  if (target.share !== undefined && (target.canShare === undefined || target.canShare({ url }))) {
    await target.share({ url });
    return { method: 'share' };
  }

  await target.clipboard.writeText(url);
  return { method: 'copy' };
}

import type { RepairTicket, TriageClaim } from '@ogm/contracts';

export function repairTicket(input: { claim: TriageClaim; signature: string; errorClass: string }): RepairTicket {
  if (!input.claim.jobId) throw new TypeError('repair ticket requires a job id');
  const release = input.claim.releaseId ?? 'draft';
  const safeClass = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(input.errorClass) ? input.errorClass : 'crash';
  const promisePath = `promises/${input.signature}.spec.ts`;
  return {
    title: `Repair: ${safeClass} in ${release} (${input.signature.slice(0, 8)})`,
    body: [
      `Repair ${safeClass} in ${release} (${input.signature.slice(0, 8)})`,
      '',
      '## Context',
      `Release: ${release}`,
      `Build: ${input.claim.buildHash}`,
      `Signature: ${input.signature}`,
      'Reproduction: reproduces_with_error',
      `gm-report:${input.claim.reportId}`,
      `gm-job:${input.claim.jobId}`,
      `<!-- gm-job:${input.claim.jobId} gm-ticket:repair-${input.signature.slice(0, 8)} gm-sig:${input.signature} -->`,
      '',
      '## Load skills',
      '- gm-repair',
      '- gm-verify',
      '',
      '## Acceptance',
      `- the promise test \`${promisePath}\` passes; gm check and gm test green`,
      `- \`.gm/changes/${input.claim.jobId}.md\` names the behaviour change`,
    ].join('\n'),
    labels: ['complexity:2', `feature:gm-${input.claim.jobId}`, 'kind:repair'],
  };
}

export function attemptTwoComment(firstAssertionLine: string): string {
  return `Attempt 2 of 2: the promise test still fails: ${firstAssertionLine.slice(0, 500)}`;
}

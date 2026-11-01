/* dev fixture secret for tests only; production reads OGM_WS_TOKEN_SECRET through @ogm/config */
export const FIXTURE_SECRET = new TextEncoder().encode('ogm-room-protocol-test-secret-0000000000');
export const OTHER_SECRET = new TextEncoder().encode('ogm-room-protocol-other-secret-111111111');

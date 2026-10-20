export const DocumentVerificationStatus = {
  PENDING: 'PENDING',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
} as const;

export type DocumentVerificationStatus =
  (typeof DocumentVerificationStatus)[keyof typeof DocumentVerificationStatus];

/** Plain shapes of sealed data, free of the browser's crypto so the server shares them. */
export type EncryptionAlgorithm = 'AES-256-GCM';

export type AppEncryption<TAppId extends string> = {
  appId: TAppId;
  keyId: string;
  keyVersion: number;
  key: string;
};

export type EncryptedFieldPayload = {
  value: string;
  ciphertext?: string;
  nonce: string;
  keyId: string;
  keyVersion: number;
  algorithm: EncryptionAlgorithm;
};

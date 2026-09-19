import { Client, cryptoUtils, Signature } from '@hiveio/dhive';
import type { ExtendedAccount } from '@hiveio/dhive';

export type HiveAuthProvider = 'keychain' | 'hivesigner';

export type HiveAccountClient = {
  getAccount(username: string): Promise<ExtendedAccount | null>;
};

export class DhiveAccountClient implements HiveAccountClient {
  private readonly client: Client;

  constructor(rpcUrl: string) {
    this.client = new Client([rpcUrl]);
  }

  async getAccount(username: string) {
    const [account] = await this.client.database.getAccounts([username]);

    return account ?? null;
  }
}

export type HiveSignatureVerificationInput = {
  username: string;
  message: string;
  signature: string;
  publicKey?: string | undefined;
};

export type HiveSignatureVerifier = {
  verifyPostingSignature(input: HiveSignatureVerificationInput): Promise<boolean>;
};

export class DhivePostingSignatureVerifier implements HiveSignatureVerifier {
  constructor(private readonly accountClient: HiveAccountClient) {}

  async verifyPostingSignature(input: HiveSignatureVerificationInput) {
    let recoveredPublicKey: string;

    try {
      const digest = cryptoUtils.sha256(input.message);
      recoveredPublicKey = Signature.fromString(input.signature).recover(digest, 'STM').toString();
    } catch {
      return false;
    }

    if (input.publicKey && input.publicKey !== recoveredPublicKey) {
      return false;
    }

    const account = await this.accountClient.getAccount(input.username);

    if (!account) {
      return false;
    }

    const matchingKey = account.posting.key_auths.find(
      ([publicKey]) => publicKey.toString() === recoveredPublicKey,
    );

    if (!matchingKey) {
      return false;
    }

    const [, weight] = matchingKey;

    return weight >= account.posting.weight_threshold;
  }
}

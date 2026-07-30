import {
  createHiveChain,
  createWaxFoundation,
  type ApiTransaction,
  type IHiveChainInterface,
  type IWaxBaseInterface,
  type IWaxOptionsChain,
} from '@hiveio/wax';

import {
  DEFAULT_HIVE_RPC_URL,
  DEFAULT_HIVELORE_APP_ID,
  HIVE_MAINNET_CHAIN_ID,
} from './constants.js';
import type {
  BuiltHiveTransaction,
  HiveLoreOperation,
  HiveTransactionSigner,
  SignedHiveTransaction,
} from './types.js';

interface WaxTransactionLike {
  pushOperation(operation: HiveLoreOperation): WaxTransactionLike;
  validate(): void;
  toApiJson(): ApiTransaction;
  toBinaryForm(stripToUnsignedTransaction?: boolean): string;
  readonly requiredAuthorities: unknown;
  readonly id: string;
}

interface WaxChainLike {
  createTransaction(expirationTime?: unknown): Promise<WaxTransactionLike>;
  broadcast(transaction: ApiTransaction): Promise<void>;
}

interface WaxFoundationLike {
  createTransactionFromJson(transaction: ApiTransaction): WaxTransactionLike;
  convertTransactionToBinaryForm(transaction: ApiTransaction, stripSignatures?: boolean): string;
}

export interface HiveWaxClientOptions {
  apiEndpoint?: string;
  appName?: string;
  apiTimeoutMs?: number;
  createChain?: (options: Partial<IWaxOptionsChain>) => Promise<WaxChainLike>;
  createFoundation?: (options: { chainId: string }) => Promise<WaxFoundationLike>;
}

export class HiveWaxClient {
  private readonly chainOptions: Partial<IWaxOptionsChain>;
  private readonly createChain: (options: Partial<IWaxOptionsChain>) => Promise<WaxChainLike>;
  private readonly createFoundation: (options: { chainId: string }) => Promise<WaxFoundationLike>;
  private chainPromise?: Promise<WaxChainLike>;
  private foundationPromise?: Promise<WaxFoundationLike>;

  constructor(options: HiveWaxClientOptions = {}) {
    this.chainOptions = {
      chainId: HIVE_MAINNET_CHAIN_ID,
      apiEndpoint: options.apiEndpoint ?? DEFAULT_HIVE_RPC_URL,
      waxApiCaller: options.appName ?? DEFAULT_HIVELORE_APP_ID,
      apiTimeout: options.apiTimeoutMs ?? 10_000,
    };
    this.createChain = options.createChain ?? createDefaultChain;
    this.createFoundation = options.createFoundation ?? createDefaultFoundation;
  }

  async buildTransaction(operations: HiveLoreOperation[]): Promise<BuiltHiveTransaction> {
    const chain = await this.getChain();
    const transaction = await chain.createTransaction('+10m');

    for (const operation of operations) {
      transaction.pushOperation(operation);
    }

    transaction.validate();

    return {
      transaction: transaction.toApiJson(),
      binaryHex: transaction.toBinaryForm(),
      unsignedBinaryHex: transaction.toBinaryForm(true),
      requiredAuthorities: transaction.requiredAuthorities,
    };
  }

  async signTransaction(
    builtTransaction: BuiltHiveTransaction,
    signer: HiveTransactionSigner,
  ): Promise<SignedHiveTransaction> {
    const foundation = await this.getFoundation();
    const signedTransaction = await signer.signTransaction(builtTransaction.transaction);
    const transaction = foundation.createTransactionFromJson(signedTransaction);

    transaction.validate();

    return {
      transaction: transaction.toApiJson(),
      binaryHex: transaction.toBinaryForm(),
      transactionId: transaction.id,
    };
  }

  async serializeTransaction(
    transaction: ApiTransaction,
    stripSignatures = false,
  ): Promise<string> {
    const foundation = await this.getFoundation();

    return foundation.convertTransactionToBinaryForm(transaction, stripSignatures);
  }

  async broadcastTransaction(transaction: ApiTransaction): Promise<void> {
    const chain = await this.getChain();

    await chain.broadcast(transaction);
  }

  private getChain() {
    this.chainPromise ??= this.createChain(this.chainOptions);

    return this.chainPromise;
  }

  private getFoundation() {
    this.foundationPromise ??= this.createFoundation({
      chainId: this.chainOptions.chainId ?? HIVE_MAINNET_CHAIN_ID,
    });

    return this.foundationPromise;
  }
}

async function createDefaultChain(
  options: Partial<IWaxOptionsChain>,
): Promise<IHiveChainInterface> {
  return createHiveChain(options);
}

async function createDefaultFoundation(options: { chainId: string }): Promise<IWaxBaseInterface> {
  return createWaxFoundation(options);
}

export type BrowserCredential = {
  id: string;
  providerId: string;
  label: string;
  kind: "api_key" | "oauth_token" | "local_placeholder";
  encryptedValue: string;
  createdAt: string;
  updatedAt: string;
};

export type BrowserCredentialInput = Omit<BrowserCredential, "id" | "createdAt" | "updatedAt">;

export type CredentialRepository = {
  list(): Promise<BrowserCredential[]>;
  get(id: string): Promise<BrowserCredential | undefined>;
  save(input: BrowserCredentialInput): Promise<BrowserCredential>;
  update(
    id: string,
    input: Partial<Pick<BrowserCredential, "label" | "encryptedValue" | "kind">>
  ): Promise<BrowserCredential>;
  delete(id: string): Promise<void>;
};

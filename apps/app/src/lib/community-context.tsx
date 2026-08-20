import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type CommunityContextValue = {
  selectedCommunityId: string | null;
  setSelectedCommunityId: (id: string | null) => void;
  selectedCommunityRole: string | null;
  selectedCommunityTier: string | null;
  setSelectedCommunityAccess: (access: {
    role?: string | null;
    tier?: string | null;
  }) => void;
};

const CommunityContext = createContext<CommunityContextValue | null>(null);
const STORAGE_KEY = "gavelhouse:selected-community-id";

export function readStoredCommunityId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistCommunitySelection(
  selectedCommunityId: string | null,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (selectedCommunityId) {
      window.localStorage.setItem(STORAGE_KEY, selectedCommunityId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures and keep the in-memory selection.
  }
}

export function subscribeToCommunitySelection(
  setSelectedCommunityIdState: (id: string | null) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) {
      setSelectedCommunityIdState(event.newValue);
    }
  }

  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}

type CommunityProviderProps = {
  initialId: string | null;
  children: ReactNode;
};

export function CommunityProvider({
  initialId,
  children,
}: CommunityProviderProps) {
  const [selectedCommunityId, setSelectedCommunityIdState] = useState<
    string | null
  >(() => readStoredCommunityId() ?? initialId);
  const [selectedCommunityRole, setSelectedCommunityRole] = useState<
    string | null
  >(null);
  const [selectedCommunityTier, setSelectedCommunityTier] = useState<
    string | null
  >(null);

  function setSelectedCommunityId(id: string | null) {
    setSelectedCommunityIdState(id);
  }

  function setSelectedCommunityAccess(access: {
    role?: string | null;
    tier?: string | null;
  }) {
    if ("role" in access) setSelectedCommunityRole(access.role ?? null);
    if ("tier" in access) setSelectedCommunityTier(access.tier ?? null);
  }

  useEffect(() => {
    if (initialId !== null && selectedCommunityId === null) {
      setSelectedCommunityIdState(initialId);
    }
  }, [initialId, selectedCommunityId]);

  useEffect(() => {
    persistCommunitySelection(selectedCommunityId);
  }, [selectedCommunityId]);

  useEffect(() => {
    return subscribeToCommunitySelection(setSelectedCommunityIdState);
  }, []);

  return (
    <CommunityContext.Provider
      value={{
        selectedCommunityId,
        setSelectedCommunityId,
        selectedCommunityRole,
        selectedCommunityTier,
        setSelectedCommunityAccess,
      }}
    >
      {children}
    </CommunityContext.Provider>
  );
}

export function useCommunity(): CommunityContextValue {
  const ctx = useContext(CommunityContext);
  if (!ctx) {
    throw new Error("useCommunity must be used within a CommunityProvider");
  }
  return ctx;
}

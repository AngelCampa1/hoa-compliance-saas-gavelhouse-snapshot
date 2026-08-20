import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React, { useState } from "react";
import {
  CommunityProvider,
  useCommunity,
  persistCommunitySelection,
  readStoredCommunityId,
  subscribeToCommunitySelection,
} from "@/lib/community-context";

function DisplayId() {
  const { selectedCommunityId } = useCommunity();
  return <div data-testid="id">{selectedCommunityId ?? "null"}</div>;
}

function SwitchButton({ newId }: { newId: string }) {
  const { setSelectedCommunityId } = useCommunity();
  return <button onClick={() => setSelectedCommunityId(newId)}>switch</button>;
}

function DisplayAccess() {
  const { selectedCommunityRole, selectedCommunityTier } = useCommunity();
  return (
    <div data-testid="access">
      {selectedCommunityRole ?? "null"}:{selectedCommunityTier ?? "null"}
    </div>
  );
}

function AccessButtons() {
  const { setSelectedCommunityAccess } = useCommunity();
  return (
    <>
      <button
        onClick={() =>
          setSelectedCommunityAccess({ role: "admin", tier: "growth" })
        }
      >
        set access
      </button>
      <button onClick={() => setSelectedCommunityAccess({ role: null })}>
        clear role
      </button>
      <button onClick={() => setSelectedCommunityAccess({ tier: null })}>
        clear tier
      </button>
    </>
  );
}

describe("CommunityProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("prefers the persisted community id from localStorage", () => {
    window.localStorage.setItem(
      "gavelhouse:selected-community-id",
      "persisted",
    );

    render(
      <CommunityProvider initialId="community-1">
        <DisplayId />
      </CommunityProvider>,
    );

    expect(screen.getByTestId("id").textContent).toBe("persisted");
  });

  it("provides the initial community id to children", () => {
    render(
      <CommunityProvider initialId="community-1">
        <DisplayId />
      </CommunityProvider>,
    );
    expect(screen.getByTestId("id").textContent).toBe("community-1");
  });

  it("provides null when initialId is null", () => {
    render(
      <CommunityProvider initialId={null}>
        <DisplayId />
      </CommunityProvider>,
    );
    expect(screen.getByTestId("id").textContent).toBe("null");
  });

  it("updates selectedCommunityId when setSelectedCommunityId is called", () => {
    render(
      <CommunityProvider initialId="community-1">
        <DisplayId />
        <SwitchButton newId="community-2" />
      </CommunityProvider>,
    );

    expect(screen.getByTestId("id").textContent).toBe("community-1");

    act(() => {
      screen.getByRole("button", { name: "switch" }).click();
    });

    expect(screen.getByTestId("id").textContent).toBe("community-2");
    expect(
      window.localStorage.getItem("gavelhouse:selected-community-id"),
    ).toBe("community-2");
  });

  it("falls back to the initial id when reading storage fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage denied");
    });

    render(
      <CommunityProvider initialId="community-1">
        <DisplayId />
      </CommunityProvider>,
    );

    expect(screen.getByTestId("id").textContent).toBe("community-1");
  });

  it("returns null and no-ops when window is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(readStoredCommunityId()).toBeNull();
    expect(() => persistCommunitySelection("community-1")).not.toThrow();
    const unsubscribe = subscribeToCommunitySelection(() => undefined);
    expect(unsubscribe).toEqual(expect.any(Function));
    expect(() => unsubscribe()).not.toThrow();
  });

  it("can switch back to different ids multiple times", () => {
    render(
      <CommunityProvider initialId="a">
        <DisplayId />
        <SwitchButton newId="b" />
      </CommunityProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "switch" }).click();
    });
    expect(screen.getByTestId("id").textContent).toBe("b");
  });

  it("syncs selectedCommunityId from storage events and ignores unrelated keys", () => {
    render(
      <CommunityProvider initialId="community-1">
        <DisplayId />
      </CommunityProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unrelated",
          newValue: "community-ignored",
        }),
      );
    });

    expect(screen.getByTestId("id").textContent).toBe("community-1");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "gavelhouse:selected-community-id",
          newValue: "community-2",
        }),
      );
    });

    expect(screen.getByTestId("id").textContent).toBe("community-2");
  });

  it("keeps the in-memory id when localStorage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });

    render(
      <CommunityProvider initialId="community-1">
        <DisplayId />
        <SwitchButton newId="community-2" />
      </CommunityProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "switch" }).click();
    });

    expect(screen.getByTestId("id").textContent).toBe("community-2");
  });

  it("syncs selectedCommunityId when initialId transitions from null to a real id", () => {
    function Wrapper() {
      const [id, setId] = useState<string | null>(null);
      return (
        <>
          <button onClick={() => setId("community-async")}>load</button>
          <CommunityProvider initialId={id}>
            <DisplayId />
          </CommunityProvider>
        </>
      );
    }

    render(<Wrapper />);
    expect(screen.getByTestId("id").textContent).toBe("null");

    act(() => {
      screen.getByRole("button", { name: "load" }).click();
    });

    expect(screen.getByTestId("id").textContent).toBe("community-async");
  });

  it("tracks selected community role and tier independently", () => {
    render(
      <CommunityProvider initialId="community-1">
        <DisplayAccess />
        <AccessButtons />
      </CommunityProvider>,
    );

    expect(screen.getByTestId("access").textContent).toBe("null:null");

    act(() => {
      screen.getByRole("button", { name: "set access" }).click();
    });
    expect(screen.getByTestId("access").textContent).toBe("admin:growth");

    act(() => {
      screen.getByRole("button", { name: "clear role" }).click();
    });
    expect(screen.getByTestId("access").textContent).toBe("null:growth");

    act(() => {
      screen.getByRole("button", { name: "clear tier" }).click();
    });
    expect(screen.getByTestId("access").textContent).toBe("null:null");
  });
});

describe("useCommunity", () => {
  it("throws when used outside of CommunityProvider", () => {
    // Suppress React error boundary noise in test output
    const originalError = console.error;
    console.error = () => undefined;

    function Thrower() {
      useCommunity();
      return null;
    }

    expect(() => render(<Thrower />)).toThrow(
      "useCommunity must be used within a CommunityProvider",
    );

    console.error = originalError;
  });
});

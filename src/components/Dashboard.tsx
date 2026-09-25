"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import BookingDrawer from "@/components/BookingDrawer";
import CatalogDrawer from "@/components/CatalogDrawer";
import ChatThread from "@/components/ChatThread";
import HoursPlaceDrawer from "@/components/HoursPlaceDrawer";
import InboxSidebar from "@/components/InboxSidebar";
import KnowledgeDrawer from "@/components/KnowledgeDrawer";
import Navbar, { type DeskView } from "@/components/Navbar";
import OnboardingTour from "@/components/OnboardingTour";
import { I18nProvider } from "@/components/I18nProvider";
import { HintsProvider } from "@/components/HintsProvider";
import {
  deskHref,
  parseDeskPath,
  type BookingDeskTab,
  type KnowledgeDeskTab,
} from "@/lib/desk-routes";
import { normalizeLocale } from "@/lib/i18n/locales";
import { translate } from "@/lib/i18n";
import {
  defaultPrefs,
  fetchAccountPrefs,
  isTourDone,
  loadPrefs,
  persistAccountPrefs,
  resetTourDone,
  type OperatorPrefs,
} from "@/lib/prefs";
import { withSyncedReactionPayload } from "@/lib/message-actions";
import { applyTheme } from "@/lib/themes";
import type {
  ConversationStatus,
  ConversationSummary,
  MessagePlatform,
  MessengerMessage,
} from "@/lib/types";

type PageRow = {
  id: string;
  page_id: string;
  page_name: string;
  facebook_user_id?: string | null;
  connected_at: string;
};

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname() || "/inbox";
  const desk = useMemo(() => parseDeskPath(pathname), [pathname]);
  const deskView = desk.view;
  const bookingTab = desk.bookingTab;
  const knowledgeTab = desk.knowledgeTab;

  const [pages, setPages] = useState<PageRow[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState("");
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<MessengerMessage | null>(null);
  const [reactingMid, setReactingMid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [endingChat, setEndingChat] = useState(false);
  const [chatStatus, setChatStatus] = useState<ConversationStatus>("open");
  const [chatSummary, setChatSummary] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [suggestionsKey, setSuggestionsKey] = useState(0);
  const [faqKey, setFaqKey] = useState(0);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | MessagePlatform>("all");
  const [bookingsFocusPeer, setBookingsFocusPeer] = useState(false);
  const [bookingRefreshKey, setBookingRefreshKey] = useState(0);
  const [prefs, setPrefs] = useState<OperatorPrefs>(defaultPrefs);
  const [tourToken, setTourToken] = useState(0);
  const [forceTour, setForceTour] = useState(false);
  const [urlReady, setUrlReady] = useState(false);

  const accountId = useMemo(() => {
    const page = pages.find((p) => p.page_id === selectedPageId);
    const id = page?.facebook_user_id?.trim();
    return id && id.length > 0 ? id : "local";
  }, [pages, selectedPageId]);

  function syncChatUrl(pageId: string, peerId: string) {
    const params = new URLSearchParams(window.location.search);
    // Drop one-shot OAuth flash params
    params.delete("connected");
    params.delete("warn");
    params.delete("error");

    if (pageId) params.set("page", pageId);
    else params.delete("page");

    if (peerId) params.set("chat", peerId);
    else params.delete("chat");

    const qs = params.toString();
    const path = window.location.pathname || "/inbox";
    const next = qs ? `${path}?${qs}` : path;
    window.history.replaceState({}, "", next);
  }

  function navigateDesk(
    view: DeskView,
    opts?: { bookingTab?: BookingDeskTab; knowledgeTab?: KnowledgeDeskTab },
  ) {
    if (deskView === "bookings" && view !== "bookings") {
      setBookingRefreshKey((k) => k + 1);
    }
    const href = deskHref(view, opts);
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    params.delete("connected");
    params.delete("warn");
    params.delete("error");
    if (selectedPageId) params.set("page", selectedPageId);
    else params.delete("page");
    if (selectedPeerId) params.set("chat", selectedPeerId);
    else params.delete("chat");
    const qs = params.toString();
    router.push(qs ? `${href}?${qs}` : href);
  }

  useEffect(() => {
    const loaded = loadPrefs();
    setPrefs(loaded);
    applyTheme(loaded.theme, loaded.customColors);
    if (!isTourDone()) {
      setForceTour(false);
      setTourToken(1);
    }

    const params = new URLSearchParams(window.location.search);
    const pageFromUrl = params.get("page")?.trim() ?? "";
    const chatFromUrl = params.get("chat")?.trim() ?? "";
    if (pageFromUrl) setSelectedPageId(pageFromUrl);
    if (chatFromUrl) setSelectedPeerId(chatFromUrl);
    setUrlReady(true);

    const connected = params.get("connected");
    const warn = params.get("warn");
    const err = params.get("error");
    if (connected) setBanner(`Connected ${connected} page(s).`);
    if (warn) setBanner((b) => `${b ?? ""} Webhook subscribe warning: ${warn}`.trim());
    if (err) setError(err);
    if (connected || warn || err) {
      // Keep page/chat deep link; only strip flash params
      syncChatUrl(pageFromUrl, chatFromUrl);
    }
  }, []);

  const loadPages = useCallback(async () => {
    const res = await fetch("/api/pages");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load pages");
    const list = (data.pages ?? []) as PageRow[];
    setPages(list);
    setSelectedPageId((prev) => {
      if (prev && list.some((p) => p.page_id === prev)) return prev;
      return list[0]?.page_id || "";
    });
  }, []);

  const loadConversations = useCallback(async (pageId: string) => {
    if (!pageId) {
      setConversations([]);
      return;
    }
    const res = await fetch(`/api/messages?page_id=${encodeURIComponent(pageId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load conversations");
    setConversations(data.conversations ?? []);
  }, []);

  const loadThread = useCallback(async (pageId: string, peerId: string) => {
    if (!pageId || !peerId) {
      setMessages([]);
      return;
    }
    const res = await fetch(
      `/api/messages?page_id=${encodeURIComponent(pageId)}&peer_id=${encodeURIComponent(peerId)}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load messages");
    setMessages(data.messages ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [loadPages]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep deep link in the address bar: /?page=PAGE_ID&chat=PEER_ID
  useEffect(() => {
    if (!urlReady) return;
    syncChatUrl(selectedPageId, selectedPeerId);
  }, [urlReady, selectedPageId, selectedPeerId]);

  // Load theme / prefs from DB for the Facebook account that owns the selected page
  useEffect(() => {
    if (!urlReady) return;
    let cancelled = false;
    // Instant cache while DB loads
    const cached = loadPrefs(accountId);
    setPrefs(cached);
    applyTheme(cached.theme, cached.customColors);

    void fetchAccountPrefs(accountId)
      .then(async ({ prefs: loaded, source }) => {
        if (cancelled) return;
        if (source === "default") {
          // First time for this account: seed DB from local cache
          const seeded = await persistAccountPrefs(cached, accountId);
          if (cancelled) return;
          setPrefs(seeded);
          applyTheme(seeded.theme, seeded.customColors);
          return;
        }
        // One-time: new locale/hints columns defaulted in DB while cache already differs
        const localeNeedsSeed =
          loaded.locale === "en" && cached.locale !== "en";
        const hintsNeedsSeed =
          loaded.showHints === true && cached.showHints === false;
        if (localeNeedsSeed || hintsNeedsSeed) {
          const merged = {
            ...loaded,
            locale: localeNeedsSeed ? cached.locale : loaded.locale,
            showHints: hintsNeedsSeed ? cached.showHints : loaded.showHints,
          };
          const seeded = await persistAccountPrefs(merged, accountId);
          if (cancelled) return;
          setPrefs(seeded);
          applyTheme(seeded.theme, seeded.customColors);
          return;
        }
        setPrefs(loaded);
        applyTheme(loaded.theme, loaded.customColors);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load theme prefs");
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, urlReady]);

  useEffect(() => {
    if (!selectedPageId) return;
    void loadConversations(selectedPageId).catch((err) =>
      setError(err instanceof Error ? err.message : "Conversations failed"),
    );
  }, [selectedPageId, loadConversations]);

  useEffect(() => {
    if (!selectedPageId || !selectedPeerId) return;
    void loadThread(selectedPageId, selectedPeerId).catch((err) =>
      setError(err instanceof Error ? err.message : "Thread failed"),
    );
  }, [selectedPageId, selectedPeerId, loadThread]);

  useEffect(() => {
    setReplyTo(null);
    setReactingMid(null);
  }, [selectedPeerId]);

  useEffect(() => {
    if (!selectedPageId) return;
    const id = window.setInterval(() => {
      void loadConversations(selectedPageId);
      if (selectedPeerId) void loadThread(selectedPageId, selectedPeerId);
    }, 5000);
    return () => window.clearInterval(id);
  }, [selectedPageId, selectedPeerId, loadConversations, loadThread]);

  useEffect(() => {
    if (!selectedPageId || !selectedPeerId) {
      setChatStatus("open");
      setChatSummary(null);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/conversations/end?page_id=${encodeURIComponent(selectedPageId)}&peer_id=${encodeURIComponent(selectedPeerId)}`,
        );
        const data = await res.json();
        if (!res.ok) return;
        setChatStatus(
          data.state?.status === "ended"
            ? "ended"
            : data.state?.status === "human"
              ? "human"
              : "open",
        );
        setChatSummary(data.state?.last_summary ?? null);
      } catch {
        // ignore
      }
    })();
  }, [selectedPageId, selectedPeerId]);

  const selectedPage = useMemo(
    () => pages.find((p) => p.page_id === selectedPageId) ?? null,
    [pages, selectedPageId],
  );

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.peer_id === selectedPeerId) ?? null,
    [conversations, selectedPeerId],
  );

  const threadPlatform: MessagePlatform =
    selectedConversation?.platform ??
    messages.find((m) => m.platform)?.platform ??
    "messenger";

  async function disconnectPage(pageId: string) {
    if (!confirm(translate(prefs.locale, "dashboard.disconnectConfirm"))) return;
    const res = await fetch(`/api/pages?page_id=${encodeURIComponent(pageId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Disconnect failed");
      return;
    }
    if (selectedPageId === pageId) {
      setSelectedPageId("");
      setSelectedPeerId("");
      setMessages([]);
    }
    await refresh();
  }

  async function setConversationStatus(status: "open" | "human") {
    if (!selectedPageId || !selectedPeerId) return;
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations/end", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: selectedPageId,
          peer_id: selectedPeerId,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update conversation");
      setChatStatus(status);
      setConversations((prev) =>
        prev.map((c) =>
          c.peer_id === selectedPeerId ? { ...c, status } : c,
        ),
      );
      await loadConversations(selectedPageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update conversation");
    } finally {
      setStatusBusy(false);
    }
  }

  async function endChat() {
    if (!selectedPageId || !selectedPeerId) return;
    if (
      !confirm(
        "End this chat? AI will summarize it and propose FAQ suggestions for approval. Auto-replies pause until you resume.",
      )
    ) {
      return;
    }

    setEndingChat(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: selectedPageId,
          peer_id: selectedPeerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to end chat");

      setChatStatus("ended");
      setChatSummary(data.summary ?? null);
      setConversations((prev) =>
        prev.map((c) =>
          c.peer_id === selectedPeerId ? { ...c, status: "ended" } : c,
        ),
      );
      setSuggestionsKey((k) => k + 1);
      setBanner(
        data.suggestion_count
          ? `Chat ended. ${data.suggestion_count} FAQ suggestion(s) ready for approval.`
          : "Chat ended. AI found no new FAQ ideas (nothing beyond existing FAQs).",
      );
      navigateDesk("knowledge", { knowledgeTab: "suggestions" });
      await loadConversations(selectedPageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end chat");
    } finally {
      setEndingChat(false);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPageId || !selectedPeerId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: selectedPageId,
          recipient_id: selectedPeerId,
          text: draft.trim(),
          platform: threadPlatform,
          reply_to_mid: replyTo?.mid ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setDraft("");
      setReplyTo(null);
      await loadThread(selectedPageId, selectedPeerId);
      await loadConversations(selectedPageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function reactToMessage(mid: string, reaction: string | null) {
    if (!selectedPageId || !selectedPeerId || !mid) return;
    setReactingMid(mid);
    setError(null);
    try {
      const res = await fetch("/api/messages/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: selectedPageId,
          recipient_id: selectedPeerId,
          mid,
          reaction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "React failed");
      setMessages((prev) =>
        prev.map((m) =>
          m.mid === mid
            ? {
                ...m,
                page_reaction: reaction,
                raw_payload: withSyncedReactionPayload(
                  m.raw_payload,
                  "page_reaction",
                  reaction,
                ),
              }
            : m,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "React failed");
    } finally {
      setReactingMid(null);
    }
  }

  function handlePrefsChange(next: OperatorPrefs) {
    setPrefs(next);
    applyTheme(next.theme, next.customColors);
    void persistAccountPrefs(next, accountId).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to save theme"),
    );
  }

  function handleLocaleChange(locale: OperatorPrefs["locale"]) {
    handlePrefsChange({ ...prefs, locale: normalizeLocale(locale) });
  }

  function restartTour() {
    resetTourDone();
    setForceTour(true);
    setTourToken((t) => t + 1);
  }

  function changeDeskView(next: DeskView) {
    if (next === "bookings") {
      setBookingsFocusPeer(false);
      navigateDesk("bookings", { bookingTab: "schedule" });
      return;
    }
    if (next === "knowledge") {
      navigateDesk("knowledge", { knowledgeTab: "faq" });
      return;
    }
    if (next === "hours") {
      navigateDesk("hours");
      return;
    }
    if (next === "catalog") {
      navigateDesk("catalog");
      return;
    }
    navigateDesk("inbox");
  }

  function openBookingsForPeer() {
    setBookingsFocusPeer(true);
    navigateDesk("bookings", { bookingTab: "schedule" });
  }

  const notices = (
    <>
      {loading ? (
        <div className="ch-notice">{translate(prefs.locale, "common.loading")}</div>
      ) : null}
      {!prefs.defaultAiReplies ? (
        <div className="ch-notice">
          {translate(prefs.locale, "dashboard.aiOff")}
        </div>
      ) : null}
      {banner ? (
        <div className="ch-notice is-success">
          <span>{banner}</span>
          <button type="button" className="ch-notice-dismiss" onClick={() => setBanner(null)}>
            {translate(prefs.locale, "common.dismiss")}
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="ch-notice is-danger" role="alert">
          <span>{error}</span>
          <button type="button" className="ch-notice-dismiss" onClick={() => setError(null)}>
            {translate(prefs.locale, "common.dismiss")}
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <I18nProvider locale={prefs.locale} onLocaleChange={handleLocaleChange}>
      <HintsProvider enabled={prefs.showHints !== false}>
      <div className="ch-shell">
        <OnboardingTour runToken={tourToken} force={forceTour} />

        <div className="ch-stage">
          <Navbar
            pages={pages}
            selectedPageId={selectedPageId}
            onSelectPage={(id) => {
              setSelectedPageId(id);
              setSelectedPeerId("");
              setMessages([]);
              navigateDesk("inbox");
            }}
            onDisconnect={disconnectPage}
            prefs={prefs}
            onPrefsChange={handlePrefsChange}
            onRestartTour={restartTour}
            deskView={deskView}
            onDeskViewChange={changeDeskView}
          />

          {banner || error || loading || !prefs.defaultAiReplies ? (
            <div className="ch-notices">{notices}</div>
          ) : null}

          {deskView === "inbox" ? (
            <div className="ch-desk-page ch-inbox-split" key="desk-inbox">
              <div
                className={`ch-inbox-pane ${
                  selectedPeerId ? "hidden md:flex" : "flex"
                }`}
              >
                <InboxSidebar
                  conversations={conversations}
                  selectedPeerId={selectedPeerId}
                  onSelect={setSelectedPeerId}
                  search={search}
                  onSearchChange={setSearch}
                  platformFilter={platformFilter}
                  onPlatformFilterChange={setPlatformFilter}
                />
              </div>
              <div
                className={`ch-thread-pane ${
                  selectedPeerId ? "flex" : "hidden md:flex"
                }`}
              >
                <ChatThread
                  peerId={selectedPeerId}
                  displayName={selectedConversation?.display_name}
                  platform={threadPlatform}
                  status={chatStatus}
                  summary={chatSummary}
                  messages={messages}
                  draft={draft}
                  onDraftChange={setDraft}
                  replyTo={replyTo}
                  onReplyTo={setReplyTo}
                  sending={sending}
                  reactingMid={reactingMid}
                  ending={endingChat}
                  statusBusy={statusBusy}
                  onSend={sendReply}
                  onReact={(mid, reaction) => void reactToMessage(mid, reaction)}
                  onHandover={() => void setConversationStatus("human")}
                  onContinueAi={() => void setConversationStatus("open")}
                  onEndChat={() => void endChat()}
                  onBack={() => setSelectedPeerId("")}
                  pageId={selectedPageId}
                  bookingRefreshKey={bookingRefreshKey}
                  onOpenBookings={openBookingsForPeer}
                  onBookingError={setError}
                />
              </div>
            </div>
          ) : deskView === "bookings" ? (
            <div className="ch-desk-page" key="desk-bookings">
              {selectedPageId ? (
                <BookingDrawer
                  open
                  onClose={() => changeDeskView("inbox")}
                  pageId={selectedPageId}
                  pageName={selectedPage?.page_name}
                  focusPeerId={
                    bookingsFocusPeer && selectedPeerId ? selectedPeerId : null
                  }
                  focusPeerName={
                    bookingsFocusPeer
                      ? selectedConversation?.display_name ?? null
                      : null
                  }
                  onError={setError}
                  refreshKey={bookingRefreshKey}
                  tab={bookingTab}
                  onTabChange={(next) =>
                    navigateDesk("bookings", { bookingTab: next })
                  }
                />
              ) : (
                <div className="ch-empty-line">{translate(prefs.locale, "dashboard.connectBookings")}</div>
              )}
            </div>
          ) : deskView === "hours" ? (
            <div className="ch-desk-page" key="desk-hours">
              {selectedPageId ? (
                <HoursPlaceDrawer
                  open
                  onClose={() => changeDeskView("inbox")}
                  pageId={selectedPageId}
                  onError={setError}
                />
              ) : (
                <div className="ch-empty-line">{translate(prefs.locale, "dashboard.connectHours")}</div>
              )}
            </div>
          ) : deskView === "catalog" ? (
            <div className="ch-desk-page" key="desk-catalog">
              {selectedPageId ? (
                <CatalogDrawer
                  open
                  onClose={() => changeDeskView("inbox")}
                  pageId={selectedPageId}
                  onError={setError}
                />
              ) : (
                <div className="ch-empty-line">{translate(prefs.locale, "dashboard.connectCatalog")}</div>
              )}
            </div>
          ) : (
            <div className="ch-desk-page" key="desk-knowledge">
              <KnowledgeDrawer
                open
                pageId={selectedPageId}
                onClose={() => changeDeskView("inbox")}
                onError={setError}
                suggestionsKey={suggestionsKey}
                faqKey={faqKey}
                tab={knowledgeTab}
                onTabChange={(next) =>
                  navigateDesk("knowledge", { knowledgeTab: next })
                }
                onApproved={() => setFaqKey((k) => k + 1)}
              />
            </div>
          )}
        </div>
      </div>
      </HintsProvider>
    </I18nProvider>
  );
}
